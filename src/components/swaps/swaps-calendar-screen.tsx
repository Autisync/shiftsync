import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { View } from "react-big-calendar";
import { Button } from "@/components/ui/button";
import { getBackend } from "@/services/backend/backend-provider";
import type { BackendServices } from "@/services/backend/types";
import type {
  HRSettings,
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
  UserProfile,
} from "@/types/domain";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { buildRankedSwapMatches } from "@/features/swaps/services/swap-matching";
import type { RankedSwapMatch } from "@/features/swaps/services/swap-matching";
import { validateSwapConstraints } from "@/features/swaps/services/swap-constraints";
import {
  generateSwapEmailTemplate,
  generateMailtoLink,
  generateGmailComposeLink,
  generateOutlookComposeLink,
} from "@/lib/swap-email-template";
import { SwapCalendar } from "@/components/swaps/SwapCalendar";
import { SwapSidePanel } from "@/components/swaps/SwapSidePanel";
import { SwapRequestList } from "@/components/swaps/SwapRequestList";
import type {
  SwapCalendarEventItem,
  SwapCalendarEventStatus,
} from "@/components/swaps/swap-calendar.types";
import { SwapSuggestionCard } from "@/components/swaps/SwapSuggestionCard";
import { HRSettingsModal } from "@/components/swaps/hr-settings-modal";

interface SwapsCalendarScreenProps {
  userId: string;
  enabled: boolean;
  backend?: Pick<BackendServices, "shifts" | "swaps" | "users">;
}

function fallbackProfile(userId: string): UserProfile {
  return {
    id: userId,
    employeeCode: userId.slice(0, 8),
    fullName: null,
    email: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function deriveStatusForShift(
  shift: Shift,
  openShiftIds: Set<string>,
  swapRequests: SwapRequest[],
  userId: string,
): {
  status: SwapCalendarEventStatus;
  request?: SwapRequest;
  violation: boolean;
} {
  const related = swapRequests.filter(
    (request) =>
      request.requesterShiftId === shift.id ||
      request.targetShiftId === shift.id,
  );

  if (related.length === 0) {
    return {
      status: openShiftIds.has(shift.id) ? "open" : "normal",
      violation: false,
    };
  }

  const latest = related[0];
  const violation = Boolean(latest.ruleViolation);

  if (violation) {
    return { status: "violation", request: latest, violation: true };
  }
  if (latest.status === "approved") {
    return { status: "approved", request: latest, violation: false };
  }
  if (latest.status === "rejected") {
    return { status: "rejected", request: latest, violation: false };
  }
  if (latest.status === "pending") {
    if (latest.requesterUserId === userId) {
      return { status: "sent", request: latest, violation: false };
    }
    return { status: "received", request: latest, violation: false };
  }

  return {
    status: openShiftIds.has(shift.id) ? "open" : "normal",
    request: latest,
    violation: false,
  };
}

export function SwapsCalendarScreen({
  userId,
  enabled,
  backend,
}: SwapsCalendarScreenProps) {
  const api = backend ?? getBackend();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<View>("month");

  const [ownShifts, setOwnShifts] = useState<Shift[]>([]);
  const [openAvailabilities, setOpenAvailabilities] = useState<
    Array<{ shift: Shift; availability: SwapAvailability }>
  >([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [userDisplayNames, setUserDisplayNames] = useState<
    Record<string, string>
  >({});
  const [requestShiftsById, setRequestShiftsById] = useState<
    Record<string, Shift>
  >({});
  const [hrSettingsOpen, setHrSettingsOpen] = useState(false);
  const [hrSettings, setHrSettings] = useState<HRSettings | null>(null);

  const [selectedEvent, setSelectedEvent] =
    useState<SwapCalendarEventItem | null>(null);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [busyMatchKey, setBusyMatchKey] = useState<string | null>(null);

  const openOwnShiftIds = useMemo(
    () =>
      new Set(
        openAvailabilities
          .filter((entry) => entry.shift.userId === userId)
          .map((entry) => entry.availability.shiftId),
      ),
    [openAvailabilities, userId],
  );

  const matches = useMemo(
    () =>
      buildRankedSwapMatches({
        userId,
        ownShifts,
        openAvailabilities,
      }),
    [openAvailabilities, ownShifts, userId],
  );

  const selectedShiftSuggestions = useMemo(() => {
    if (!selectedEvent) return [];
    return matches.filter(
      (match) => match.ownShift.id === selectedEvent.shift.id,
    );
  }, [matches, selectedEvent]);

  const selectedDaySuggestions = useMemo(() => {
    const selectedDay = calendarDate.toISOString().slice(0, 10);
    return matches.filter((match) => match.ownShift.date === selectedDay);
  }, [calendarDate, matches]);

  const calendarEvents = useMemo<SwapCalendarEventItem[]>(() => {
    return ownShifts
      .filter((shift) => shift.status !== "deleted")
      .map((shift) => {
        const derived = deriveStatusForShift(
          shift,
          openOwnShiftIds,
          swapRequests,
          userId,
        );
        return {
          id: shift.id,
          title: `Turno ${new Date(shift.startsAt).toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}-${new Date(shift.endsAt).toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          subtitle:
            derived.status === "open" ? "Disponivel para troca" : undefined,
          start: new Date(shift.startsAt),
          end: new Date(shift.endsAt),
          shift,
          status: derived.status,
          request: derived.request,
          violation: derived.violation,
        };
      });
  }, [ownShifts, openOwnShiftIds, swapRequests, userId]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [shifts, availabilities, requests] = await Promise.all([
        api.shifts.getShiftsForUser(userId),
        api.swaps.getOpenAvailabilities(),
        api.swaps.getSwapRequestsForUser(userId),
      ]);

      const participantIds = Array.from(
        new Set([
          ...availabilities.map((entry) => entry.shift.userId),
          ...requests.flatMap((request) => [
            request.requesterUserId,
            request.targetUserId,
          ]),
        ]),
      );

      const profileResults = await Promise.allSettled(
        participantIds.map(async (id) => ({
          id,
          profile: await api.users.getUserProfile(id),
        })),
      );

      const requestShiftIds = Array.from(
        new Set(
          requests
            .flatMap((request) => [
              request.requesterShiftId,
              request.targetShiftId,
            ])
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const shiftResults = await Promise.allSettled(
        requestShiftIds.map(async (id) => ({
          id,
          shift: await api.shifts.getShiftById(id),
        })),
      );

      const names: Record<string, string> = {};
      for (const result of profileResults) {
        if (result.status !== "fulfilled") continue;
        const profile = result.value.profile;
        if (!profile) continue;
        names[result.value.id] =
          profile.fullName ||
          profile.email ||
          profile.employeeCode ||
          result.value.id.slice(0, 8);
      }

      const shiftsById: Record<string, Shift> = {};
      for (const result of shiftResults) {
        if (result.status !== "fulfilled") continue;
        if (!result.value.shift) continue;
        shiftsById[result.value.id] = result.value.shift;
      }

      const settings = await api.swaps.getHRSettings(userId);

      setOwnShifts(shifts);
      setOpenAvailabilities(availabilities);
      setSwapRequests(requests);
      setUserDisplayNames(names);
      setRequestShiftsById(shiftsById);
      setHrSettings(settings);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled || !userId) return;
    void loadData();
    const id = window.setInterval(() => void loadData(true), 10000);
    return () => window.clearInterval(id);
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
      await loadData(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyShiftId(null);
    }
  };

  const onSendRequest = async (match: RankedSwapMatch) => {
    const key = `${match.ownShift.id}-${match.targetShift.id}`;
    setBusyMatchKey(key);
    setError(null);
    setFeedback(null);
    try {
      await api.swaps.createSwapRequest({
        requesterUserId: userId,
        requesterShiftId: match.ownShift.id,
        targetUserId: match.targetShift.userId,
        targetShiftId: match.targetShift.id,
        message: `Sugestao de calendario com score ${match.score}`,
      });
      setFeedback("Pedido de troca enviado.");
      await loadData(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyMatchKey(null);
    }
  };

  const onStatusChange = async (
    request: SwapRequest,
    status: SwapRequestStatus,
  ) => {
    setError(null);
    setFeedback(null);
    try {
      if (status === "accepted") {
        const requesterShifts = await api.shifts.getShiftsForUser(
          request.requesterUserId,
        );
        const targetShifts = await api.shifts.getShiftsForUser(
          request.targetUserId,
        );
        const validation = validateSwapConstraints({
          requesterShifts,
          targetShifts,
          ownShiftId: request.requesterShiftId,
          targetShiftId: request.targetShiftId,
        });
        await api.swaps.acceptSwapRequest(request.id, userId, validation);
        setFeedback(
          validation.valid
            ? "Pedido aceite."
            : "Aceite com violacoes de regras.",
        );
      } else {
        await api.swaps.updateSwapStatus(request.id, status, userId);
        setFeedback(`Pedido atualizado para ${status}.`);
      }
      await loadData(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onSendToHr = async (request: SwapRequest) => {
    setError(null);
    setFeedback(null);
    try {
      const requester =
        (await api.users.getUserProfile(request.requesterUserId)) ??
        fallbackProfile(request.requesterUserId);
      const target =
        (await api.users.getUserProfile(request.targetUserId)) ??
        fallbackProfile(request.targetUserId);
      const requesterShift = await api.shifts.getShiftById(
        request.requesterShiftId,
      );
      const targetShift = request.targetShiftId
        ? await api.shifts.getShiftById(request.targetShiftId)
        : null;

      if (!requesterShift) {
        throw new Error("Turno do requisitante nao encontrado");
      }

      const activeHrSettings =
        hrSettings ?? (await api.swaps.getHRSettings(userId));
      if (!activeHrSettings) {
        setFeedback("Configure primeiro os dados de RH para enviar o pedido.");
        setHrSettingsOpen(true);
        return;
      }

      const template = generateSwapEmailTemplate({
        request,
        requester,
        target,
        requesterShift,
        targetShift,
        hrEmail: activeHrSettings.hrEmail,
        ccEmails: activeHrSettings.ccEmails,
      });

      const mailto = generateMailtoLink(
        template.subject,
        template.body,
        template.to,
        template.cc,
      );
      const gmail = generateGmailComposeLink(
        template.subject,
        template.body,
        template.to,
        template.cc,
      );
      const outlook = generateOutlookComposeLink(
        template.subject,
        template.body,
        template.to,
        template.cc,
      );

      window.open(gmail, "_blank", "noopener,noreferrer") ||
        window.open(outlook, "_blank", "noopener,noreferrer") ||
        window.open(mailto, "_blank", "noopener,noreferrer");

      setFeedback(
        "Rascunho de email aberto. Confirme no cartao do pedido apos enviar.",
      );
      await api.swaps.markHREmailSent(request.id);
      await loadData(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onApplySwap = async (request: SwapRequest) => {
    setError(null);
    setFeedback(null);
    try {
      await api.swaps.applySwap(request.id);
      setFeedback("Troca marcada como aplicada.");
      await loadData(true);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!enabled) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Trocas desativadas. Ative VITE_ENABLE_SWAPS=true.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="space-y-5"
    >
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-[0_10px_32px_-24px_rgba(30,64,175,0.5)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Trocas em Vista de Calendario
            </h2>
            <p className="text-sm text-slate-600">
              Visualize turnos, disponibilidade aberta e pedidos no mesmo fluxo.
            </p>
          </div>
          {loading ? (
            <span className="text-xs text-slate-500">A carregar...</span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Erro ao carregar trocas: {error}
          </div>
        ) : null}

        {feedback ? (
          <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {feedback}
          </div>
        ) : null}

        <SwapCalendar
          events={calendarEvents}
          view={calendarView}
          date={calendarDate}
          onViewChange={setCalendarView}
          onNavigate={setCalendarDate}
          onSelectEvent={(event) => setSelectedEvent(event)}
        />
      </div>

      <SwapSidePanel
        open={Boolean(selectedEvent)}
        selectedShift={selectedEvent?.shift ?? null}
        isOpenForSwap={
          selectedEvent ? openOwnShiftIds.has(selectedEvent.shift.id) : false
        }
        loading={Boolean(
          selectedEvent?.shift && busyShiftId === selectedEvent.shift.id,
        )}
        suggestions={selectedShiftSuggestions}
        userDisplayNames={userDisplayNames}
        onClose={() => setSelectedEvent(null)}
        onToggleAvailability={onToggleAvailability}
        onSendRequest={onSendRequest}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Pedidos de Troca
        </h3>
        <p className="text-xs text-slate-600">
          Pendentes, enviados, recebidos, aprovados, rejeitados e historico
          completo.
        </p>
        <div className="mt-3">
          <SwapRequestList
            requests={swapRequests}
            currentUserId={userId}
            userDisplayNames={userDisplayNames}
            shiftById={requestShiftsById}
            onStatusChange={onStatusChange}
            onSendToHr={onSendToHr}
            onApplySwap={onApplySwap}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
            Sugestoes para o Dia Selecionado
          </h3>
          <span className="text-xs text-slate-500">
            {calendarDate.toLocaleDateString("pt-PT")}
          </span>
        </div>
        {selectedDaySuggestions.length === 0 ? (
          <p className="text-sm text-slate-500">Sem sugestoes para este dia.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {selectedDaySuggestions.slice(0, 9).map((match) => (
              <SwapSuggestionCard
                key={`${match.ownShift.id}-${match.targetShift.id}`}
                match={match}
                targetUserDisplayName={
                  userDisplayNames[match.targetShift.userId]
                }
                disabled={
                  busyMatchKey ===
                  `${match.ownShift.id}-${match.targetShift.id}`
                }
                onSendRequest={onSendRequest}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHrSettingsOpen(true)}>
            Configurar RH
          </Button>
          <Button variant="outline" onClick={() => void loadData()}>
            Atualizar
          </Button>
        </div>
      </div>

      <HRSettingsModal
        isOpen={hrSettingsOpen}
        userId={userId}
        backend={api}
        onClose={() => setHrSettingsOpen(false)}
        onSaved={(settings) => {
          setHrSettings(settings);
          setFeedback("Definicoes de RH guardadas com sucesso.");
        }}
      />
    </motion.div>
  );
}
