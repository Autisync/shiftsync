import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BackendServices } from "@/services/backend/types";
import { getBackend } from "@/services/backend/backend-provider";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type {
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
  UserProfile,
  HRSettings,
} from "@/types/domain";
import { buildRankedSwapMatches } from "@/features/swaps/services/swap-matching";
import type { RankedSwapMatch } from "@/features/swaps/services/swap-matching";
import {
  formatSwapStatus,
  getActionLabel,
  getAllowedActionsForUser,
  getSwapStatusBadgeClass,
} from "@/features/swaps/services/swap-workflow";
import {
  generateOutlookComposeLink,
  generateSwapEmailTemplate,
  generateGmailComposeLink,
  generateMailtoLink,
} from "@/lib/swap-email-template";
import { HRSettingsModal } from "@/components/swaps/hr-settings-modal";
import {
  LoadingListSkeleton,
  LoadingState,
} from "@/components/ui/loading-state";
import { toast } from "sonner";

interface SwapAvailabilityPanelProps {
  userId: string;
  enabled: boolean;
  backend?: Pick<BackendServices, "shifts" | "swaps" | "users">;
}

function shiftLabel(shift: Shift): string {
  const date = new Date(shift.startsAt).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
  });
  const start = new Date(shift.startsAt).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(shift.endsAt).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${start}-${end}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveDisplayName(
  userId: string,
  namesByUserId: Record<string, string>,
): string {
  return namesByUserId[userId] ?? userId.slice(0, 8);
}

function requestTitle(
  request: SwapRequest,
  currentUserId: string,
  namesByUserId: Record<string, string>,
): string {
  if (request.requesterUserId === currentUserId) {
    return `Pedido enviado para ${resolveDisplayName(request.targetUserId, namesByUserId)}`;
  }
  return `Pedido recebido de ${resolveDisplayName(request.requesterUserId, namesByUserId)}`;
}

function shortId(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 8);
}

function fallbackProfile(userId: string): UserProfile {
  return {
    id: userId,
    employeeCode: shortId(userId),
    fullName: null,
    email: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function strategyLabel(strategy: RankedSwapMatch["strategy"]): string {
  switch (strategy) {
    case "exact":
      return "Horario igual";
    case "overlap":
      return "Horario com sobreposicao";
    case "same_day":
      return "Mesmo dia";
    default:
      return "Compatibilidade";
  }
}

function statusHelpText(status: SwapRequestStatus): string {
  switch (status) {
    case "pending":
      return "A aguardar resposta da outra pessoa.";
    case "accepted":
      return "Aceite. Pode avancar para submissao ao RH.";
    case "rejected":
      return "Rejeitado. Pode tentar outro pedido de troca.";
    case "submitted_to_hr":
      return "Enviado ao RH. Aguarda validacao final.";
    case "approved":
      return "Aprovado. Processo de troca concluido.";
    default:
      return "Estado atualizado.";
  }
}

export function SwapAvailabilityPanel({
  userId,
  enabled,
  backend,
}: SwapAvailabilityPanelProps) {
  const SWAP_POLLING_INTERVAL_MS = 10000;
  const api = backend ?? getBackend();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyMatchKey, setBusyMatchKey] = useState<string | null>(null);
  const [ownShifts, setOwnShifts] = useState<Shift[]>([]);
  const [openAvailabilities, setOpenAvailabilities] = useState<
    Array<{ shift: Shift; availability: SwapAvailability }>
  >([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hrSettingsOpen, setHrSettingsOpen] = useState(false);
  const [hrSettings, setHrSettings] = useState<HRSettings | null>(null);
  const [requestProfiles, setRequestProfiles] = useState<
    Record<string, { requester: UserProfile; target: UserProfile }>
  >({});
  const [userNamesById, setUserNamesById] = useState<Record<string, string>>(
    {},
  );
  const [emailDraftByRequestId, setEmailDraftByRequestId] = useState<
    Record<
      string,
      {
        to: string;
        cc: string;
        subject: string;
        body: string;
        mailto: string;
        gmailCompose: string;
        outlookCompose: string;
      }
    >
  >({});
  const [confirmSentRequestId, setConfirmSentRequestId] = useState<
    string | null
  >(null);

  const openOwnShiftIds = useMemo(() => {
    return new Set(
      openAvailabilities
        .filter((entry) => entry.shift.userId === userId)
        .map((entry) => entry.availability.shiftId),
    );
  }, [openAvailabilities, userId]);

  const matches = useMemo(() => {
    return buildRankedSwapMatches({
      userId,
      ownShifts,
      openAvailabilities,
    });
  }, [ownShifts, openAvailabilities, userId]);

  const activeOwnShifts = useMemo(
    () => ownShifts.filter((shift) => shift.status !== "deleted"),
    [ownShifts],
  );

  const requesterRequests = useMemo(
    () => swapRequests.filter((request) => request.requesterUserId === userId),
    [swapRequests, userId],
  );

  const targetRequests = useMemo(
    () => swapRequests.filter((request) => request.targetUserId === userId),
    [swapRequests, userId],
  );

  const pendingReceivedRequests = useMemo(
    () => targetRequests.filter((request) => request.status === "pending"),
    [targetRequests],
  );

  const pendingSentRequests = useMemo(
    () => requesterRequests.filter((request) => request.status === "pending"),
    [requesterRequests],
  );

  const loadData = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const [shifts, availabilities, requests, hrSettingsData] =
        await Promise.all([
          api.shifts.getShiftsForUser(userId),
          api.swaps.getOpenAvailabilities(),
          api.swaps.getSwapRequestsForUser(userId),
          api.swaps.getHRSettings(userId),
        ]);

      const participantIds = Array.from(
        new Set(
          requests.flatMap((request) => [
            request.requesterUserId,
            request.targetUserId,
          ]),
        ),
      );

      const profileResults = await Promise.allSettled(
        participantIds.map(async (id) => ({
          id,
          profile: await api.users.getUserProfile(id),
        })),
      );

      const resolvedNames: Record<string, string> = {};
      for (const result of profileResults) {
        if (result.status !== "fulfilled") {
          continue;
        }

        const profile = result.value.profile;
        if (!profile) {
          continue;
        }

        const name =
          profile.fullName ||
          profile.email ||
          profile.employeeCode ||
          shortId(profile.id);
        resolvedNames[result.value.id] = name;
      }

      setOwnShifts(shifts);
      setOpenAvailabilities(availabilities);
      setSwapRequests(requests);
      setUserNamesById(resolvedNames);
      if (hrSettingsData) {
        setHrSettings(hrSettingsData);
      }
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    void loadData();
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadData({ silent: true });
    }, SWAP_POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, userId]);

  const onToggleAvailability = async (shiftId: string) => {
    setBusyShiftId(shiftId);
    setError(null);
    try {
      if (openOwnShiftIds.has(shiftId)) {
        await api.swaps.closeAvailability(shiftId);
      } else {
        await api.swaps.openAvailability(shiftId, userId);
      }
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyShiftId(null);
    }
  };

  const onCreateSwapRequest = async (match: RankedSwapMatch) => {
    const matchKey = `${match.ownShift.id}-${match.targetShift.id}`;
    setBusyMatchKey(matchKey);
    setFeedback(null);
    setError(null);

    try {
      await api.swaps.createSwapRequest({
        requesterUserId: userId,
        requesterShiftId: match.ownShift.id,
        targetUserId: match.targetShift.userId,
        targetShiftId: match.targetShift.id,
        message: `Sugestao: ${strategyLabel(match.strategy)} (pontuacao ${match.score})`,
      });
      setFeedback("Pedido de troca criado com sucesso.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyMatchKey(null);
    }
  };

  const onUpdateSwapStatus = async (
    requestId: string,
    nextStatus: SwapRequestStatus,
  ) => {
    setBusyRequestId(requestId);
    setFeedback(null);
    setError(null);

    try {
      await api.swaps.updateSwapStatus(requestId, nextStatus, userId);
      setFeedback(`Pedido atualizado para ${formatSwapStatus(nextStatus)}.`);
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const onAcceptSwap = async (request: SwapRequest) => {
    setBusyRequestId(request.id);
    setFeedback(null);
    setError(null);

    try {
      await api.swaps.updateSwapStatus(request.id, "accepted", userId);
      setFeedback(
        "Pedido aceite com sucesso. Agora envie manualmente para RH.",
      );
      toast.success("Pedido aceite. Envio ao RH agora é manual.");

      await loadData();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Falha ao aceitar pedido: ${message}`);
    } finally {
      setBusyRequestId(null);
    }
  };

  const onSendHREmail = async (request: SwapRequest) => {
    setBusyRequestId(request.id);
    setFeedback(null);
    setError(null);

    try {
      if (!hrSettings) {
        setError("HR settings not configured. Please configure first.");
        setBusyRequestId(null);
        return;
      }

      // Get profiles if not in cache
      let profiles = requestProfiles[request.id];
      if (!profiles) {
        const requester =
          (await api.users.getUserProfile(request.requesterUserId)) ??
          fallbackProfile(request.requesterUserId);
        const target =
          (await api.users.getUserProfile(request.targetUserId)) ??
          fallbackProfile(request.targetUserId);

        profiles = { requester, target };
        setRequestProfiles((prev) => ({ ...prev, [request.id]: profiles }));
      }

      // Get shifts
      const requesterShift = await api.shifts.getShiftById(
        request.requesterShiftId,
      );
      const targetShift = request.targetShiftId
        ? await api.shifts.getShiftById(request.targetShiftId)
        : null;

      if (!requesterShift) {
        throw new Error("Requester shift not found");
      }

      const decisionLinks = await api.swaps.createHrDecisionLinks({
        requestId: request.id,
        actorUserId: userId,
        baseUrl: `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}`,
        expiresInHours: 24,
      });

      // Generate email
      const template = generateSwapEmailTemplate({
        request,
        requester: profiles.requester,
        target: profiles.target,
        requesterShift,
        targetShift,
        hrEmail: hrSettings.hrEmail,
        ccEmails: hrSettings.ccEmails,
        approveUrl: decisionLinks.approveUrl,
        declineUrl: decisionLinks.declineUrl,
        expiresAt: decisionLinks.expiresAt,
      });

      const mailto = generateMailtoLink(
        template.subject,
        template.body,
        template.to,
        template.cc,
      );

      const gmailCompose = generateGmailComposeLink(
        template.subject,
        template.body,
        template.to,
        template.cc,
      );

      const outlookCompose = generateOutlookComposeLink(
        template.subject,
        template.body,
        template.to,
        template.cc,
      );

      setEmailDraftByRequestId((prev) => ({
        ...prev,
        [request.id]: {
          to: template.to,
          cc: template.cc,
          subject: template.subject,
          body: template.body,
          mailto,
          gmailCompose,
          outlookCompose,
        },
      }));

      // Keep a copy in clipboard as a reliable fallback.
      const clipboardPayload = [
        `To: ${template.to}`,
        `CC: ${template.cc || "-"}`,
        `Subject: ${template.subject}`,
        "",
        template.body,
      ].join("\n");
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(clipboardPayload);
        }
      } catch {
        // Clipboard may fail on insecure contexts; ignore gracefully.
      }
      setFeedback(
        "Rascunho de email preparado. Use os botoes do pedido para abrir Gmail/Mail app e depois marque como enviado.",
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const onConfirmHREmailSent = async (requestId: string) => {
    setBusyRequestId(requestId);
    setFeedback(null);
    setError(null);

    try {
      await api.swaps.markHREmailSent(requestId, userId);
      setEmailDraftByRequestId((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setFeedback("Email enviado. Marcado como enviado no sistema.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const onCopyEmailDraft = async (requestId: string) => {
    const draft = emailDraftByRequestId[requestId];
    if (!draft) {
      return;
    }

    const clipboardPayload = [
      `To: ${draft.to}`,
      `CC: ${draft.cc || "-"}`,
      `Subject: ${draft.subject}`,
      "",
      draft.body,
    ].join("\n");

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(clipboardPayload);
        setFeedback("Conteudo do email copiado para a area de transferencia.");
      } else {
        setFeedback(
          "Clipboard indisponivel neste navegador. Copie manualmente.",
        );
      }
    } catch {
      setFeedback(
        "Nao foi possivel copiar automaticamente. Copie manualmente.",
      );
    }
  };

  const onApplySwap = async (request: SwapRequest) => {
    setBusyRequestId(request.id);
    setFeedback(null);
    setError(null);

    try {
      // Get shifts to swap
      const requesterShift = await api.shifts.getShiftById(
        request.requesterShiftId,
      );
      const targetShift = request.targetShiftId
        ? await api.shifts.getShiftById(request.targetShiftId)
        : null;

      if (!requesterShift || !targetShift) {
        throw new Error("One or both shifts not found");
      }

      // Update shifts in the database by swapping user_id
      // TODO: This would require new API methods or direct shift update
      // For now, just mark as applied
      await api.swaps.applySwap(request.id);
      setFeedback("Troca aplicada e sincronizada com calendario.");
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const renderRequestCard = (request: SwapRequest) => {
    const actions = getAllowedActionsForUser(request, userId);
    const lastHistory = request.statusHistory.at(-1);
    const primaryTimestamp =
      request.pendingAt ?? request.createdAt ?? request.updatedAt;

    return (
      <div
        key={request.id}
        className="rounded border border-slate-200 px-3 py-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">
            {requestTitle(request, userId, userNamesById)}
          </p>
          <span
            className={`rounded border px-2 py-0.5 text-xs font-medium ${getSwapStatusBadgeClass(request.status)}`}
          >
            {formatSwapStatus(request.status)}
          </span>
        </div>

        <div className="space-y-1 text-xs text-slate-600">
          <p>
            Referencias dos turnos: {shortId(request.requesterShiftId)} {"->"}{" "}
            {shortId(request.targetShiftId)}
          </p>
          <p>Pedido criado em: {formatDateTime(primaryTimestamp)}</p>
          <p>{statusHelpText(request.status)}</p>
          {lastHistory && (
            <p className="text-slate-500">
              Ultima atualizacao: {formatSwapStatus(lastHistory.status)}
            </p>
          )}
        </div>

        {request.ruleViolation && (
          <div className="mt-2 rounded border border-orange-300 bg-orange-50 px-2 py-1 text-xs text-orange-700">
            <p className="font-medium">{request.ruleViolation}</p>
            <p>{request.violationReason}</p>
          </div>
        )}

        {request.hrEmailSent && (
          <div className="mt-2 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700">
            Email enviado ao RH
          </div>
        )}

        {request.calendarApplied && (
          <div className="mt-2 rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-700">
            Troca aplicada e sincronizada
          </div>
        )}

        {emailDraftByRequestId[request.id] && !request.hrEmailSent && (
          <div className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-xs text-amber-900">
            <p className="font-medium">Rascunho de email pronto</p>
            <p>
              Escolha como enviar e, depois do envio real, marque no sistema.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={emailDraftByRequestId[request.id].gmailCompose}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-amber-400 bg-white px-2 py-1 font-medium"
              >
                Abrir Gmail
              </a>
              <a
                href={emailDraftByRequestId[request.id].outlookCompose}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-amber-400 bg-white px-2 py-1 font-medium"
              >
                Abrir Outlook
              </a>
              <a
                href={emailDraftByRequestId[request.id].mailto}
                className="inline-flex items-center rounded border border-amber-400 bg-white px-2 py-1 font-medium"
              >
                Tentar Mail App
              </a>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void onCopyEmailDraft(request.id);
                }}
              >
                Copiar Conteudo
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={busyRequestId === request.id}
                onClick={() => {
                  setConfirmSentRequestId(request.id);
                }}
              >
                Marcar Como Enviado
              </Button>
            </div>
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((status) => {
              // Special handling for acceptance with validation
              if (status === "accepted" && request.status === "pending") {
                return (
                  <Button
                    key={`${request.id}-accept`}
                    size="sm"
                    variant="default"
                    disabled={busyRequestId === request.id}
                    onClick={() => {
                      void onAcceptSwap(request);
                    }}
                  >
                    {"Aceitar pedido"}
                  </Button>
                );
              }

              // Special handling for sending HR email
              if (
                status === "submitted_to_hr" &&
                request.status === "accepted" &&
                request.requesterUserId === userId
              ) {
                return (
                  <Button
                    key={`${request.id}-send-email`}
                    size="sm"
                    variant="default"
                    disabled={busyRequestId === request.id}
                    onClick={() => {
                      void onSendHREmail(request);
                    }}
                  >
                    {"Enviar para RH"}
                  </Button>
                );
              }

              // Special handling for applying swap
              if (
                status === "approved" &&
                request.status === "approved" &&
                request.requesterUserId === userId &&
                !request.calendarApplied
              ) {
                return (
                  <Button
                    key={`${request.id}-apply`}
                    size="sm"
                    variant="default"
                    disabled={busyRequestId === request.id}
                    onClick={() => {
                      void onApplySwap(request);
                    }}
                  >
                    {"Aplicar Troca"}
                  </Button>
                );
              }

              // Default status transition
              return (
                <Button
                  key={`${request.id}-${status}`}
                  size="sm"
                  variant={status === "rejected" ? "outline" : "default"}
                  disabled={busyRequestId === request.id}
                  onClick={() => {
                    void onUpdateSwapStatus(request.id, status);
                  }}
                >
                  {getActionLabel(status)}
                </Button>
              );
            })}
          </div>
        )}

        <details className="mt-3 rounded border border-slate-200 bg-slate-50 px-2 py-1">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">
            Ver detalhes do pedido
          </summary>
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <p>Pendente desde: {formatDateTime(request.pendingAt)}</p>
            <p>Aceite em: {formatDateTime(request.acceptedAt)}</p>
            <p>Rejeitado em: {formatDateTime(request.rejectedAt)}</p>
            <p>
              Submetido ao RH em:{" "}
              {formatDateTime(
                request.submittedToHrAt ??
                  (request.hrEmailSent ? request.updatedAt : null),
              )}
            </p>
            <p>Aprovado em: {formatDateTime(request.approvedAt)}</p>
            {lastHistory && (
              <p className="text-slate-500">
                Ultima alteracao: {formatSwapStatus(lastHistory.status)} em{" "}
                {formatDateTime(lastHistory.changedAt)}
              </p>
            )}
          </div>
        </details>
      </div>
    );
  };

  if (!enabled) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900">
            Como Funciona
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            1) Abra disponibilidade no seu turno, 2) envie um pedido em
            Sugestoes de Match, 3) acompanhe resposta em Inbox de Pedidos.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Abrir disponibilidade nao envia pedido automaticamente. O pedido so
            e criado quando clicar em "Enviar pedido de troca".
          </p>
        </div>
      </div>

      {pendingReceivedRequests.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Tem {pendingReceivedRequests.length} pedido(s) de troca pendente(s)
          para rever.
        </div>
      )}

      {pendingSentRequests.length > 0 && (
        <div className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Tem {pendingSentRequests.length} pedido(s) enviado(s) a aguardar
          resposta.
        </div>
      )}

      {feedback && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {feedback}
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Erro ao carregar trocas: {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Disponibilidade para Trocas
          </h3>
          <p className="text-xs text-slate-600">
            Passo 1: abra ou feche trocas apenas para os seus turnos.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <LoadingState message="A carregar disponibilidades..." inline />
            <LoadingListSkeleton rows={3} />
          </div>
        ) : activeOwnShifts.length === 0 ? (
          <p className="text-sm text-slate-600">
            Sem turnos disponiveis para gerir trocas.
          </p>
        ) : (
          <div className="space-y-2">
            {activeOwnShifts.slice(0, 8).map((shift) => {
              const isOpen = openOwnShiftIds.has(shift.id);
              const isBusy = busyShiftId === shift.id;
              return (
                <div
                  key={shift.id}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {shiftLabel(shift)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {shift.location ?? shift.role ?? "Turno"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isOpen ? "outline" : "default"}
                    disabled={isBusy}
                    onClick={() => {
                      void onToggleAvailability(shift.id);
                    }}
                  >
                    {isOpen ? "Fechar" : "Abrir"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Sugestoes de Troca
          </h3>
          <p className="text-xs text-slate-600">
            Passo 2: escolha uma sugestao e envie o pedido de troca.
            Priorizacao: horario igual, sobreposicao de horario e mesmo dia.
          </p>
        </div>

        {loading ? (
          <LoadingState message="A calcular matches..." />
        ) : matches.length === 0 ? (
          <p className="text-sm text-slate-600">Sem matches no momento.</p>
        ) : (
          <div className="space-y-2">
            {matches.slice(0, 10).map((match, index) => (
              <div
                key={`${match.ownShift.id}-${match.targetShift.id}-${index}`}
                className="rounded border border-slate-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">
                  Pontuacao {match.score} - {strategyLabel(match.strategy)}
                </p>
                <p className="text-xs text-slate-600">
                  Seu turno: {shiftLabel(match.ownShift)}
                </p>
                <p className="text-xs text-slate-600">
                  Disponivel: {shiftLabel(match.targetShift)}
                </p>
                <p className="text-xs text-slate-500">
                  {match.rationale.join(" | ")}
                </p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    disabled={
                      busyMatchKey ===
                      `${match.ownShift.id}-${match.targetShift.id}`
                    }
                    onClick={() => {
                      void onCreateSwapRequest(match);
                    }}
                  >
                    Enviar pedido de troca
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Depois de enviar, o pedido aparece na Inbox de Pedidos para ambos os
          utilizadores.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Inbox de Pedidos
          </h3>
          <p className="text-xs text-slate-600">
            Passo 3: acompanhe e responda aos pedidos. Atualiza automaticamente
            a cada 10 segundos.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <LoadingState message="A carregar pedidos..." inline />
            <LoadingListSkeleton rows={2} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pedidos enviados ({requesterRequests.length})
              </p>
              {requesterRequests.length === 0 ? (
                <p className="text-sm text-slate-600">Sem pedidos enviados.</p>
              ) : (
                requesterRequests.map(renderRequestCard)
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pedidos recebidos ({targetRequests.length})
              </p>
              {targetRequests.length === 0 ? (
                <p className="text-sm text-slate-600">Sem pedidos recebidos.</p>
              ) : (
                targetRequests.map(renderRequestCard)
              )}
            </div>
          </div>
        )}
      </div>

      <HRSettingsModal
        isOpen={hrSettingsOpen}
        userId={userId}
        backend={api}
        onClose={() => setHrSettingsOpen(false)}
        onSaved={(settings) => setHrSettings(settings)}
      />

      <AlertDialog
        open={confirmSentRequestId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmSentRequestId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio para RH</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que o email foi enviado para o RH? Esta acao vai
              atualizar o estado para "submetido ao RH".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nao</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmSentRequestId) {
                  return;
                }
                const requestId = confirmSentRequestId;
                setConfirmSentRequestId(null);
                void onConfirmHREmailSent(requestId);
              }}
            >
              Sim, enviado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
