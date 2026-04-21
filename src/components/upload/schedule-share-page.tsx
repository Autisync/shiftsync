/**
 * Schedule Share History Page
 *
 * Shows user upload history with trust assessment, and lets the user
 * select one to sync into swap calendar with an optional acknowledgement.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ScheduleUpload, UploadTrustAssessment } from "@/types/domain";
import type { UploadService } from "@/services/backend/types";
import { Button } from "@/components/ui/button";
import { PaginatedListControls } from "@/components/ui/paginated-list-controls";
import { getErrorMessage } from "@/lib/getErrorMessage";
import {
  LoadingState,
  LoadingListSkeleton,
} from "@/components/ui/loading-state";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { readNotificationEntityFromSearch } from "@/features/notifications/notification-routing";

interface ScheduleSharePageProps {
  userId: string;
  service: UploadService;
  accessToken?: string;
  defaultCalendarId?: string | null;
}

function trustBadgeClass(
  level: UploadTrustAssessment["trustLevel"] | undefined,
): string {
  switch (level) {
    case "high":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
    default:
      return "bg-rose-50 text-rose-700 border-rose-200";
  }
}

function trustLabel(
  level: UploadTrustAssessment["trustLevel"] | undefined,
): string {
  switch (level) {
    case "high":
      return "Alta confiança";
    case "medium":
      return "Confiança média";
    default:
      return "Baixa confiança";
  }
}

export function ScheduleSharePage({
  userId,
  service,
  accessToken,
  defaultCalendarId,
}: ScheduleSharePageProps) {
  const location = useLocation();
  const [uploads, setUploads] = useState<ScheduleUpload[]>([]);
  const [assessments, setAssessments] = useState<
    Record<string, UploadTrustAssessment>
  >({});
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [focusedUpload, setFocusedUpload] = useState<ScheduleUpload | null>(
    null,
  );
  // Track the last focusedUploadId we already scrolled to so periodic
  // polling doesn't re-scroll the user away from wherever they navigated.
  const scrolledToUploadRef = useRef<string | null>(null);
  const notificationTarget = useMemo(
    () => readNotificationEntityFromSearch(location.search),
    [location.search],
  );
  const focusedUploadId =
    notificationTarget.entityType === "schedule_upload"
      ? notificationTarget.entityId
      : null;

  const isSyncSessionNotification =
    notificationTarget.entityType === "sync_session";
  const syncSessionMetadata = isSyncSessionNotification
    ? (notificationTarget.metadata as Record<string, unknown> | null)
    : null;

  const selectedUpload =
    selectedUploadId !== null
      ? (uploads.find((upload) => upload.id === selectedUploadId) ??
        (focusedUpload?.id === selectedUploadId ? focusedUpload : null))
      : null;

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.getUploadsByUserPaginated(userId, {
          page,
          pageSize,
        });
        if (!mounted) return;
        setUploads(result.items);
        setTotal(result.total);

        const assessmentMap: Record<string, UploadTrustAssessment> = {};
        for (const upload of result.items) {
          try {
            const assessment = await service.getUploadTrustAssessmentByUpload(
              upload.id,
            );
            if (assessment) {
              assessmentMap[upload.id] = assessment;
            }
          } catch {
            // Assessment not available yet — ignore.
          }
        }
        if (!mounted) return;
        setAssessments(assessmentMap);
      } catch (err) {
        if (!mounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [page, pageSize, service, userId]);

  useEffect(() => {
    if (!focusedUploadId) {
      setFocusedUpload(null);
      scrolledToUploadRef.current = null;
      return;
    }

    // Reset guard when the focused id changes.
    if (scrolledToUploadRef.current !== focusedUploadId) {
      scrolledToUploadRef.current = null;
    }

    const existing = uploads.find((upload) => upload.id === focusedUploadId);
    if (existing) {
      setFocusedUpload(null);
      setSelectedUploadId(focusedUploadId);
      if (scrolledToUploadRef.current !== focusedUploadId) {
        scrolledToUploadRef.current = focusedUploadId;
        const frameId = window.requestAnimationFrame(() => {
          document
            .getElementById(`schedule-upload-row-${focusedUploadId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return () => window.cancelAnimationFrame(frameId);
      }
      return;
    }

    // Already fetched and scrolled to this upload — skip on data refreshes.
    if (scrolledToUploadRef.current === focusedUploadId) {
      return;
    }

    let cancelled = false;

    const loadFocusedUpload = async () => {
      try {
        const upload = await service.getUploadById(focusedUploadId);
        if (!upload || cancelled) {
          if (!cancelled) {
            setFocusedUpload(null);
          }
          return;
        }

        const assessment = await service
          .getUploadTrustAssessmentByUpload(focusedUploadId)
          .catch(() => null);

        if (cancelled) {
          return;
        }

        setFocusedUpload(upload);
        setSelectedUploadId(upload.id);
        scrolledToUploadRef.current = focusedUploadId;
        if (assessment) {
          setAssessments((prev) => ({
            ...prev,
            [assessment.uploadId]: assessment,
          }));
        }
      } catch {
        if (!cancelled) {
          setFocusedUpload(null);
        }
      }
    };

    void loadFocusedUpload();

    return () => {
      cancelled = true;
    };
  }, [focusedUploadId, service, uploads]);

  // Reload first page when sync completes to show new uploads
  // Auto-refresh on page visibility change (e.g., when returning from file upload)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && page === 1) {
        // Reload first page when page becomes visible (user returns to tab)
        setPage(1);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Periodic refresh to catch new uploads (5s interval)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (page === 1 && !loading) {
        // Silently refresh first page to catch new uploads
        void (async () => {
          try {
            const result = await service.getUploadsByUserPaginated(userId, {
              page: 1,
              pageSize,
            });
            setUploads(result.items);
            setTotal(result.total);
          } catch {
            // Silently ignore refresh errors
          }
        })();
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(refreshInterval);
  }, [page, pageSize, service, userId, loading]);

  const handleSyncSelected = async () => {
    const calendarId = defaultCalendarId;
    if (!selectedUploadId || !calendarId || !accessToken) {
      setError(
        "Selecione um upload e confirme que o acesso ao calendário está ativo.",
      );
      return;
    }

    if (!acknowledged) {
      setError("Confirme que reconhece os riscos antes de sincronizar.");
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      const acknowledgedAt = new Date().toISOString();
      await service.startUploadSelectionSync({
        userId,
        uploadId: selectedUploadId,
        acknowledgeRisk: true,
        acknowledgedAt,
        acknowledgedByUserId: userId,
        calendarId,
        accessToken,
      });
      setSyncDone(true);
      setSelectedUploadId(null);
      setAcknowledged(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Recuperar Horário Partilhado
        </h2>
        <p className="text-xs text-slate-500">
          Selecione um ficheiro da sua história para sincronizar com o
          calendário padrão.
        </p>
      </div>

      {loading ? <LoadingState inline /> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {syncDone ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Sincronização iniciada com sucesso.
        </p>
      ) : null}

      {isSyncSessionNotification && syncSessionMetadata ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-900">
            Estado da Sincronização
          </h3>
          <p className="text-xs text-blue-800">
            {typeof syncSessionMetadata.status === "string" && (
              <>
                <span className="font-medium">Status:</span>{" "}
                {syncSessionMetadata.status === "syncing"
                  ? "A sincronizar..."
                  : syncSessionMetadata.status === "synced"
                    ? "Sincronização concluída"
                    : syncSessionMetadata.status === "failed"
                      ? "Falha na sincronização"
                      : syncSessionMetadata.status}
              </>
            )}
          </p>
          {typeof syncSessionMetadata.uploadId === "string" && (
            <p className="text-xs text-blue-700">
              <span className="font-medium">Upload:</span>{" "}
              {syncSessionMetadata.uploadId.slice(0, 8)}...
            </p>
          )}
          {typeof syncSessionMetadata.message === "string" && (
            <p className="text-xs text-blue-700">
              {syncSessionMetadata.message}
            </p>
          )}
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Histórico de Uploads
        </h3>
        {focusedUpload &&
        !uploads.some((upload) => upload.id === focusedUpload.id) ? (
          <div
            id={`schedule-upload-spotlight-${focusedUpload.id}`}
            className="rounded-md border border-blue-200 bg-blue-50/60 p-3 text-xs text-slate-700"
          >
            <p className="mb-2 font-semibold uppercase tracking-wide text-blue-700">
              Upload aberto via notificação
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="font-medium">Ficheiro:</span>{" "}
                {String(
                  focusedUpload.metadata?.file_name ??
                    focusedUpload.fileHash.slice(0, 12),
                )}
              </p>
              <p>
                <span className="font-medium">Data:</span>{" "}
                {new Date(focusedUpload.uploadedAt).toLocaleDateString("pt-PT")}
              </p>
              <p>
                <span className="font-medium">Cobertura:</span>{" "}
                {focusedUpload.normalizedCoverageStart &&
                focusedUpload.normalizedCoverageEnd
                  ? `${focusedUpload.normalizedCoverageStart} → ${focusedUpload.normalizedCoverageEnd}`
                  : "N/D"}
              </p>
              <p>
                <span className="font-medium">Confiança:</span>{" "}
                {trustLabel(
                  assessments[focusedUpload.id]?.trustLevel ??
                    focusedUpload.trustLevel,
                )}
              </p>
            </div>
            <div className="mt-3">
              <Button
                size="sm"
                onClick={() => setSelectedUploadId(focusedUpload.id)}
              >
                Selecionar este upload
              </Button>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Data
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Ficheiro
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Cobertura
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Colaborador
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Confiança
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Consent.
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Sincronização
                </th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && uploads.length === 0
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`upload-loading-row-${index}`}>
                      <td className="px-2 py-2" colSpan={8}>
                        <LoadingListSkeleton rows={1} />
                      </td>
                    </tr>
                  ))
                : uploads.map((upload) => {
                    const assess = assessments[upload.id];
                    const isSelected = selectedUploadId === upload.id;
                    const trustLevel = assess?.trustLevel ?? upload.trustLevel;
                    const trustScore =
                      assess?.trustScore ?? upload.trustScore ?? 0;
                    const coverageLabel =
                      upload.normalizedCoverageStart &&
                      upload.normalizedCoverageEnd
                        ? `${upload.normalizedCoverageStart} → ${upload.normalizedCoverageEnd}`
                        : "N/D";

                    return (
                      <tr
                        key={upload.id}
                        id={`schedule-upload-row-${upload.id}`}
                        className={
                          focusedUploadId === upload.id
                            ? "bg-blue-50"
                            : isSelected
                              ? "bg-slate-50"
                              : undefined
                        }
                      >
                        <td className="px-2 py-2 text-slate-600">
                          {new Date(upload.uploadedAt).toLocaleDateString(
                            "pt-PT",
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-800">
                          {String(
                            upload.metadata?.file_name ??
                              upload.fileHash.slice(0, 12),
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {coverageLabel}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {String(
                            upload.metadata?.selected_employee_name ?? "N/D",
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`rounded border px-2 py-0.5 ${trustBadgeClass(trustLevel)}`}
                          >
                            {Math.round(Number(trustScore))}%
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {upload.consentToShare ? "Sim" : "Não"}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {upload.selectedForSyncAt
                            ? `Sincronizado em ${new Date(upload.selectedForSyncAt).toLocaleDateString("pt-PT")}`
                            : upload.processingStatus === "uploaded"
                              ? "Carregado"
                              : (upload.processingStatus ?? "Carregado")}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() =>
                              setSelectedUploadId(isSelected ? null : upload.id)
                            }
                          >
                            {isSelected
                              ? "Selecionado"
                              : "Sincronizar este ficheiro"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Uploads Partilhados
        </h3>
        <p className="text-xs text-slate-500">
          {uploads.filter((u) => u.consentToShare).length} ficheiro(s) com
          consentimento de partilha.
        </p>
      </section>

      {selectedUpload ? (
        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Análise de Confiança
          </h3>
          <p className="text-xs text-slate-600">
            {(assessments[selectedUpload.id]?.trustReason ??
              selectedUpload.trustReason) ||
              "Sem análise detalhada disponível."}
          </p>

          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Cobertura de Datas
          </h3>
          <div className="grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
            <p>
              Cobertura: {selectedUpload.normalizedCoverageStart ?? "N/D"} -{" "}
              {selectedUpload.normalizedCoverageEnd ?? "N/D"}
            </p>
            <p>
              Total de turnos:{" "}
              {Number(selectedUpload.metadata?.selected_shift_count ?? 0)}
            </p>
            <p>
              Confiança:{" "}
              {Math.round(
                Number(
                  assessments[selectedUpload.id]?.trustScore ??
                    selectedUpload.trustScore ??
                    0,
                ),
              )}
              %
            </p>
            <p>
              Conflitos:{" "}
              {Number(
                assessments[selectedUpload.id]?.conflictsCount ??
                  selectedUpload.metadata?.conflicts_count ??
                  0,
              )}
            </p>
            <p>
              Origem:{" "}
              {selectedUpload.consentToShare
                ? "Upload partilhado"
                : "Upload privado"}
            </p>
            <p>
              Última sincronização:{" "}
              {selectedUpload.selectedForSyncAt
                ? new Date(selectedUpload.selectedForSyncAt).toLocaleString(
                    "pt-PT",
                  )
                : "Nunca"}
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Ação de Sincronização
            </h3>
            <p className="text-xs text-amber-800 font-medium">
              Comportamento: substituir/reconciliar para o período coberto pelo
              upload selecionado.
            </p>
            <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="h-4 w-4 rounded border-amber-400"
              />
              Compreendo que estes ficheiros podem conter erros e podem não
              estar 100% corretos.
            </label>
            <Button
              size="sm"
              disabled={
                syncing || !acknowledged || !accessToken || !defaultCalendarId
              }
              onClick={() => void handleSyncSelected()}
            >
              {syncing
                ? "A sincronizar..."
                : "Sincronizar com o calendário padrão"}
            </Button>
          </div>
        </section>
      ) : null}

      <PaginatedListControls
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}
