import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { View } from "react-big-calendar";
import { appToast as toast } from "@/lib/app-toast";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getBackend } from "@/services/backend/backend-provider";
import type { BackendServices } from "@/services/backend/types";
import type {
  HRSettings,
  LeaveRequest,
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
  UserProfile,
} from "@/types/domain";
import { getDebugErrorMessage, getErrorMessage } from "@/lib/getErrorMessage";
import { buildRankedSwapMatches } from "@/features/swaps/services/swap-matching";
import type { RankedSwapMatch } from "@/features/swaps/services/swap-matching";
import { validateSwapConstraints } from "@/features/swaps/services/swap-constraints";
import { SwapCalendar } from "@/components/swaps/SwapCalendar";
import { SwapSidePanel } from "@/components/swaps/SwapSidePanel";
import { SwapRequestList } from "@/components/swaps/SwapRequestList";
import type {
  SwapCalendarEventItem,
  SwapCalendarEventStatus,
} from "@/components/swaps/swap-calendar.types";
import { SwapSuggestionCard } from "@/components/swaps/SwapSuggestionCard";
import { LoadingState } from "@/components/ui/loading-state";
import type { ShiftData } from "@/types/shift";
import { runWithToast } from "@/lib/async-toast";
import { useRealtime } from "@/features/notifications/use-realtime";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { readNotificationEntityFromSearch } from "@/features/notifications/notification-routing";

interface SwapsCalendarScreenProps {
  userId: string;
  enabled: boolean;
  accessToken?: string | null;
  calendarId?: string | null;
  onOpenSettings?: () => void;
  backend?: Pick<
    BackendServices,
    "shifts" | "swaps" | "users" | "calendar" | "leave"
  >;
}

const SWAPS_AUTO_SYNC_INTERVAL_MS = 20000;

function toShiftData(shift: Shift): ShiftData {
  return {
    id: shift.id,
    shiftUid: shift.shiftUid ?? undefined,
    week: 0,
    date: new Date(shift.date),
    startTime: new Date(shift.startsAt).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    endTime: new Date(shift.endsAt).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    shiftType: "other",
    status: shift.status === "deleted" ? "deleted" : "active",
    location: shift.location ?? undefined,
    notes: shift.role ?? undefined,
    googleEventId: shift.googleEventId ?? undefined,
  };
}

function resolveSwapAffectedDateRange(
  shifts: Shift[],
  request: SwapRequest,
): { start: string; end: string } | undefined {
  const affectedShiftIds = new Set(
    [request.requesterShiftId, request.targetShiftId].filter(
      Boolean,
    ) as string[],
  );

  const affectedDates = shifts
    .filter((shift) => affectedShiftIds.has(shift.id))
    .map((shift) => shift.date);

  if (affectedDates.length === 0) {
    return undefined;
  }

  const sorted = [...affectedDates].sort();
  return {
    start: sorted[0],
    end: sorted[sorted.length - 1],
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
  if (latest.status === "ready_to_apply") {
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
  accessToken = null,
  calendarId = null,
  onOpenSettings,
  backend,
}: SwapsCalendarScreenProps) {
  const location = useLocation();
  const api = backend ?? getBackend();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<View>("month");

  const [ownShifts, setOwnShifts] = useState<Shift[]>([]);
  const [syncedLeaves, setSyncedLeaves] = useState<LeaveRequest[]>([]);
  const [openAvailabilities, setOpenAvailabilities] = useState<
    Array<{ shift: Shift; availability: SwapAvailability }>
  >([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [userDisplayNames, setUserDisplayNames] = useState<
    Record<string, string>
  >({});
  const [requestShiftsById, setRequestShiftsById] = useState<
    Record<string, Shift>
  >({});
  const [hrSettings, setHrSettings] = useState<HRSettings | null>(null);
  const resolvedCalendarId = calendarId ?? hrSettings?.selectedCalendarId;

  const [selectedEvent, setSelectedEvent] =
    useState<SwapCalendarEventItem | null>(null);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [busyMatchKey, setBusyMatchKey] = useState<string | null>(null);
  const [focusedRequest, setFocusedRequest] = useState<SwapRequest | null>(
    null,
  );
  const syncInFlightRef = useRef(false);
  const previousRequestStatusesRef = useRef<Map<string, SwapRequestStatus>>(
    new Map(),
  );
  const notificationTarget = useMemo(
    () => readNotificationEntityFromSearch(location.search),
    [location.search],
  );
  const focusedRequestId =
    notificationTarget.entityType === "swap_request"
      ? notificationTarget.entityId
      : null;

  const fallbackProfile = (id: string): UserProfile => ({
    id,
    employeeCode: "",
    fullName: null,
    email: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });

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
    if (!selectedEvent?.shift) return [];
    return matches.filter(
      (match) => match.ownShift.id === selectedEvent.shift.id,
    );
  }, [matches, selectedEvent]);

  const selectedDaySuggestions = useMemo(() => {
    const selectedDay = calendarDate.toISOString().slice(0, 10);
    return matches.filter((match) => match.ownShift.date === selectedDay);
  }, [calendarDate, matches]);

  const calendarEvents = useMemo<SwapCalendarEventItem[]>(() => {
    const shiftEvents = ownShifts
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
          kind: "shift" as const,
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
          allDay: false,
          shift,
          status: derived.status,
          request: derived.request,
          violation: derived.violation,
        };
      });

    const leaveEvents = syncedLeaves.map((leave) => {
      const start = new Date(
        `${leave.approvedStartDate ?? leave.startDate}T00:00:00`,
      );
      const inclusiveEnd = new Date(
        `${leave.approvedEndDate ?? leave.endDate}T00:00:00`,
      );
      inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);

      return {
        id: `leave-${leave.id}`,
        kind: "leave" as const,
        title: `Ausencia ${leave.type === "vacation" ? "- Ferias" : "- " + leave.type}`,
        subtitle:
          leave.hrResponseNotes ?? "Ausencia sincronizada no calendario",
        start,
        end: inclusiveEnd,
        allDay: true,
        leaveRequest: leave,
        status: "leave" as const,
      };
    });

    return [...shiftEvents, ...leaveEvents].sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    );
  }, [ownShifts, openOwnShiftIds, swapRequests, syncedLeaves, userId]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [shifts, availabilities, requests, leaves] = await Promise.all([
        api.shifts.getShiftsForUser(userId),
        api.swaps.getOpenAvailabilities(),
        api.swaps.getSwapRequestsForUserPaginated(userId, {
          page: requestsPage,
          pageSize: requestsPageSize,
        }),
        api.leave.getLeaveRequestsForUser(userId),
      ]);

      const participantIds = Array.from(
        new Set([
          ...availabilities.map((entry) => entry.shift.userId),
          ...requests.items.flatMap((request) => [
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
          requests.items
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

      const previousStatuses = previousRequestStatusesRef.current;
      if (previousStatuses.size > 0) {
        for (const request of requests.items) {
          const previousStatus = previousStatuses.get(request.id);
          if (!previousStatus || previousStatus === request.status) {
            continue;
          }

          if (
            request.status === "ready_to_apply" &&
            request.requesterUserId === userId
          ) {
            setFeedback("RH aprovou a troca. Já pode atualizar o calendário.");
            toast.success(
              "RH aprovou a troca. Já pode atualizar o calendário.",
            );
          }

          if (request.status === "rejected") {
            toast.error("RH recusou a troca.");
          }
        }
      }

      previousRequestStatusesRef.current = new Map(
        requests.items.map((request) => [request.id, request.status]),
      );

      setOwnShifts(shifts);
      setSyncedLeaves(
        leaves.filter(
          (leave) =>
            leave.status === "approved" &&
            Boolean(leave.calendarAppliedAt) &&
            (!resolvedCalendarId ||
              !leave.lastSyncedCalendarId ||
              leave.lastSyncedCalendarId === resolvedCalendarId),
        ),
      );
      setOpenAvailabilities(availabilities);
      setSwapRequests(requests.items);
      setRequestsTotal(requests.total);
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
  }, [enabled, userId, requestsPage, requestsPageSize, resolvedCalendarId]);

  useEffect(() => {
    if (!enabled || !userId || !focusedRequestId) {
      setFocusedRequest(null);
      return;
    }

    const existing = swapRequests.find(
      (request) => request.id === focusedRequestId,
    );
    if (existing) {
      setFocusedRequest(null);
      return;
    }

    let cancelled = false;

    const loadFocusedRequest = async () => {
      try {
        const request = await api.swaps.getSwapRequestById(focusedRequestId);
        if (!request || cancelled) {
          if (!cancelled) {
            setFocusedRequest(null);
          }
          return;
        }

        const [requesterProfile, targetProfile, requesterShift, targetShift] =
          await Promise.allSettled([
            api.users.getUserProfile(request.requesterUserId),
            api.users.getUserProfile(request.targetUserId),
            api.shifts.getShiftById(request.requesterShiftId),
            request.targetShiftId
              ? api.shifts.getShiftById(request.targetShiftId)
              : Promise.resolve(null),
          ]);

        if (cancelled) {
          return;
        }

        setFocusedRequest(request);
        setUserDisplayNames((prev) => ({
          ...prev,
          ...(requesterProfile.status === "fulfilled" && requesterProfile.value
            ? {
                [request.requesterUserId]:
                  requesterProfile.value.fullName ||
                  requesterProfile.value.email ||
                  requesterProfile.value.employeeCode ||
                  request.requesterUserId.slice(0, 8),
              }
            : {}),
          ...(targetProfile.status === "fulfilled" && targetProfile.value
            ? {
                [request.targetUserId]:
                  targetProfile.value.fullName ||
                  targetProfile.value.email ||
                  targetProfile.value.employeeCode ||
                  request.targetUserId.slice(0, 8),
              }
            : {}),
        }));
        setRequestShiftsById((prev) => ({
          ...prev,
          ...(requesterShift.status === "fulfilled" && requesterShift.value
            ? { [request.requesterShiftId]: requesterShift.value }
            : {}),
          ...(targetShift.status === "fulfilled" &&
          targetShift.value &&
          request.targetShiftId
            ? { [request.targetShiftId]: targetShift.value }
            : {}),
        }));
      } catch {
        if (!cancelled) {
          setFocusedRequest(null);
        }
      }
    };

    void loadFocusedRequest();

    return () => {
      cancelled = true;
    };
  }, [
    api.shifts,
    api.swaps,
    api.users,
    enabled,
    focusedRequestId,
    swapRequests,
    userId,
  ]);

  useRealtime({
    userId: enabled ? userId : null,
    onSwapChange: () => void loadData(true),
    onLeaveChange: () => void loadData(true),
  });

  const syncOwnCalendar = async (opts?: {
    showDeletedToast?: boolean;
    refreshAfterSync?: boolean;
  }) => {
    if (!accessToken || !resolvedCalendarId || syncInFlightRef.current) {
      return;
    }

    syncInFlightRef.current = true;
    try {
      const latestOwnShifts = await api.shifts.getShiftsForUser(userId);
      const result = await api.calendar.runSync(
        latestOwnShifts.map(toShiftData),
        {
          userId,
          accessToken,
          calendarId: resolvedCalendarId,
          fullResync: false,
          removeStaleEvents: true,
        },
      );

      if ((opts?.showDeletedToast ?? true) && result.summary.deleted > 0) {
        toast.info(
          `Sincronização detectou ${result.summary.deleted} evento(s) removido(s) no Google Calendar e atualizou o calendário de trocas.`,
        );
      }

      if (result.summary.updatedFromGoogle > 0) {
        console.info("[SwapsSync] updated_from_google", {
          user_id: userId,
          count: result.summary.updatedFromGoogle,
        });
        toast.info(
          `Sincronização reconciliou ${result.summary.updatedFromGoogle} alteração(ões) feitas diretamente no Google Calendar.`,
        );
      }

      const hasMaterialChanges =
        result.summary.created > 0 ||
        result.summary.updated > 0 ||
        result.summary.deleted > 0;

      if (hasMaterialChanges || opts?.refreshAfterSync) {
        await loadData(true);
      }
    } catch {
      // Best-effort background sync: keep UI usable even when reconciliation fails.
    } finally {
      syncInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!enabled || !userId || !accessToken || !resolvedCalendarId) {
      return;
    }

    void syncOwnCalendar({ showDeletedToast: false, refreshAfterSync: true });
    const id = window.setInterval(() => {
      void syncOwnCalendar({ showDeletedToast: true, refreshAfterSync: false });
    }, SWAPS_AUTO_SYNC_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [enabled, userId, accessToken, resolvedCalendarId]);

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
      await syncOwnCalendar({
        showDeletedToast: true,
        refreshAfterSync: false,
      });
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
      // Validate 6/60 rule constraints before sending the swap request
      const targetUserId = match.targetShift.userId;
      const targetShifts = await api.shifts.getShiftsForUser(targetUserId);

      const validationResult = validateSwapConstraints({
        requesterShifts: ownShifts,
        targetShifts: targetShifts,
        ownShiftId: match.ownShift.id,
        targetShiftId: match.targetShift.id,
      });

      if (!validationResult.valid) {
        const violationMessages = validationResult.violations
          .map((v) => v.message)
          .join("\n");
        setError(violationMessages);
        toast.error(`Nao foi possivel enviar a troca:\n${violationMessages}`);
        return;
      }

      await runWithToast(
        () =>
          api.swaps.createSwapRequest({
            requesterUserId: userId,
            requesterShiftId: match.ownShift.id,
            targetUserId: match.targetShift.userId,
            targetShiftId: match.targetShift.id,
            message: `Sugestao de calendario com score ${match.score}`,
          }),
        {
          loading: "A enviar pedido de troca...",
          success: "Pedido de troca enviado com sucesso.",
          error: (error) => `Falha ao enviar pedido: ${getErrorMessage(error)}`,
        },
      );
      setFeedback("Pedido de troca enviado.");
      setSelectedEvent(null);
      await loadData(true);
      await syncOwnCalendar({
        showDeletedToast: true,
        refreshAfterSync: false,
      });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
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
        const updatedRequest = await api.swaps.updateSwapStatus(
          request.id,
          "accepted",
          userId,
        );
        await loadData(true);
        await syncOwnCalendar({
          showDeletedToast: true,
          refreshAfterSync: false,
        });
        setFeedback("Pedido aceite. Pode agora enviá-lo ao RH.");
        toast.success("Pedido aceite com sucesso.");
      } else if (status === "submitted_to_hr") {
        await api.swaps.sendHREmail(request.id, userId);
        setFeedback("Email enviado ao RH com cópia automática para si.");
        toast.success("Email enviado ao RH.");
        await loadData(true);
      } else {
        await api.swaps.updateSwapStatus(request.id, status, userId);
        setFeedback(`Pedido atualizado para ${status}.`);
        toast.success(`Pedido atualizado para ${status}.`);
        await loadData(true);
        await syncOwnCalendar({
          showDeletedToast: true,
          refreshAfterSync: false,
        });
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Falha ao atualizar pedido: ${message}`);
    }
  };

  const onApplySwap = async (request: SwapRequest) => {
    setError(null);
    setFeedback(null);
    try {
      await runWithToast(() => api.swaps.applySwap(request.id), {
        loading: "A aplicar troca...",
        success: "Troca aplicada com sucesso.",
        error: (error) => {
          const rawMessage = getDebugErrorMessage(error);
          const message = rawMessage.includes(
            "shift ownership changed since approval",
          )
            ? "Falha ao aplicar troca: os turnos mudaram desde a aprovacao. Atualize os pedidos e tente novamente."
            : rawMessage;
          return `Falha ao atualizar calendario: ${message}`;
        },
      });

      // Reload local data first so the in-app calendar reflects the applied swap.
      await loadData(false);

      if (accessToken && resolvedCalendarId) {
        const latestOwnShifts = await api.shifts.getShiftsForUser(userId);
        const ownShiftData = latestOwnShifts.map(toShiftData);
        const affectedRange = resolveSwapAffectedDateRange(
          latestOwnShifts,
          request,
        );

        if (affectedRange) {
          toast.info(
            `Reconciliação pós-troca no Google Calendar: ${affectedRange.start} -> ${affectedRange.end}.`,
          );
        }

        const ownSyncResult = await api.calendar.runSync(ownShiftData, {
          userId,
          accessToken,
          calendarId: resolvedCalendarId,
          // Swap completion is authoritative for the affected slots.
          // We still list Google events in range, but we do not let Google
          // rewrite those just-applied shifts before diff execution.
          dateRange: affectedRange,
          fullResync: true,
          removeStaleEvents: true,
          preferPlatformChanges: true,
        });

        if (ownSyncResult.errors && ownSyncResult.errors.length > 0) {
          toast.error(
            `Google Calendar: ${ownSyncResult.errors.length} erro(s) durante sincronização. Verifique a ligação ao Google e tente novamente.`,
          );
        }

        if (ownSyncResult.summary.created > 0) {
          toast.success(
            `Google Calendar atualizado: ${ownSyncResult.summary.created} evento(s) criado(s) com o novo horário.`,
          );
        }

        if (ownSyncResult.summary.deleted > 0) {
          toast.info(
            `Sincronização removeu ${ownSyncResult.summary.deleted} evento(s) desatualizados do Google Calendar.`,
          );
        }

        if (ownSyncResult.summary.updatedFromGoogle > 0) {
          console.info("[SwapsSync] updated_from_google", {
            user_id: userId,
            count: ownSyncResult.summary.updatedFromGoogle,
          });
          toast.info(
            `Sincronização reconciliou ${ownSyncResult.summary.updatedFromGoogle} alteração(ões) feitas diretamente no Google Calendar.`,
          );
        }

        // Best effort: try syncing the counterpart user as well (works when
        // the current token/calendar has access and policy allows reading shifts).
        let counterpartSynced = false;
        const counterpartUserId =
          request.requesterUserId === userId
            ? request.targetUserId
            : request.requesterUserId;

        try {
          const counterpartShifts =
            await api.shifts.getShiftsForUser(counterpartUserId);
          if (counterpartShifts.length > 0) {
            await api.calendar.runSync(counterpartShifts.map(toShiftData), {
              userId: counterpartUserId,
              accessToken,
              calendarId: resolvedCalendarId,
              dateRange: affectedRange,
              fullResync: true,
              removeStaleEvents: true,
              preferPlatformChanges: true,
            });
            counterpartSynced = true;
          }
        } catch {
          counterpartSynced = false;
        }

        if (counterpartSynced) {
          setFeedback(
            "Troca aplicada e Google Calendar sincronizado para ambos os utilizadores.",
          );
        } else {
          setFeedback(
            "Troca aplicada e Google Calendar sincronizado para o utilizador atual. O outro utilizador deve sincronizar a propria conta.",
          );
        }
      } else {
        setFeedback(
          "Troca aplicada no sistema. Para Google Calendar, selecione um calendario e sincronize.",
        );
      }
    } catch (err) {
      const rawMessage = getErrorMessage(err);
      const message = rawMessage.includes(
        "shift ownership changed since approval",
      )
        ? "Falha ao aplicar troca: os turnos mudaram desde a aprovacao. Atualize os pedidos e tente novamente."
        : rawMessage;
      setError(message);
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
          {loading ? <LoadingState inline className="text-xs" /> : null}
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
          onSelectEvent={(event) => {
            if (event.kind === "leave") {
              const leave = event.leaveRequest;
              toast.info(
                leave?.hrResponseNotes ||
                  "Esta ausencia foi sincronizada para o calendario.",
              );
              return;
            }

            setSelectedEvent(event);
          }}
        />
      </div>

      <SwapSidePanel
        open={Boolean(selectedEvent?.shift)}
        selectedShift={selectedEvent?.shift ?? null}
        isOpenForSwap={
          selectedEvent?.shift
            ? openOwnShiftIds.has(selectedEvent.shift.id)
            : false
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
            focusedRequest={focusedRequest}
            currentUserId={userId}
            hasGoogleSyncContext={Boolean(accessToken && resolvedCalendarId)}
            userDisplayNames={userDisplayNames}
            shiftById={requestShiftsById}
            page={requestsPage}
            pageSize={requestsPageSize}
            total={requestsTotal}
            loading={loading}
            onPageChange={setRequestsPage}
            onStatusChange={onStatusChange}
            onApplySwap={onApplySwap}
            focusedRequestId={focusedRequestId}
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
        <Button variant="outline" onClick={() => void loadData()}>
          Atualizar
        </Button>
      </div>
    </motion.div>
  );
}
