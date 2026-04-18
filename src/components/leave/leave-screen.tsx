/**
 * src/components/leave/leave-screen.tsx
 *
 * Main leave management screen — full lifecycle.
 *
 *   draft           → form saves locally, mailto opens → pending
 *   pending         → user marks approved / rejected (after HR response)
 *   approved        → editable approved dates (férias) + calendar sync
 *   soft_declined   → auto-set by Supabase cron after 30 days pending
 *
 * Gated by VITE_ENABLE_LEAVE. All status changes go through
 * the notification abstraction service.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getErrorMessage } from "@/lib/getErrorMessage";
import type { LeaveRequest, Shift } from "@/types/domain";
import type { BackendServices } from "@/services/backend/types";
import {
  assertLeaveStatusTransition,
  formatLeaveStatus,
} from "@/features/leave/services/leave-workflow";
import { syncLeaveToCalendar } from "@/features/leave/services/leave-calendar-sync";
import { dispatchLeaveStatusChange } from "@/features/notifications/notification-service";
import { toast } from "sonner";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import {
  LoadingListSkeleton,
  LoadingState,
} from "@/components/ui/loading-state";
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
import { runWithToast } from "@/lib/async-toast";
import { useRealtime } from "@/features/notifications/use-realtime";
import {
  feedbackMessages,
  invalidTransitionMessage,
} from "@/lib/feedback-messages";
import type {
  LeaveApproveInput,
  LeaveRejectInput,
} from "@/components/leave/LeaveRequestCard";

interface LeaveScreenProps {
  userId: string;
  backend: BackendServices;
  /** Passed from HR settings — used to pre-fill mailto. */
  hrEmail?: string;
  ccEmails?: string[];
  employeeName?: string;
  employeeCode?: string;
  /** Google Calendar access token (needed for calendar sync). */
  accessToken?: string | null;
  /** Selected default calendar id. */
  defaultCalendarId?: string | null;
}

export function LeaveScreen({
  userId,
  backend,
  hrEmail,
  ccEmails,
  employeeName,
  employeeCode,
  accessToken,
  defaultCalendarId,
}: LeaveScreenProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsPageSize] = useState(10);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leaves, userShifts] = await Promise.all([
        backend.leave.getLeaveRequestsForUserPaginated(userId, {
          page: requestsPage,
          pageSize: requestsPageSize,
        }),
        backend.shifts.getShiftsForUser(userId),
      ]);
      setRequests(leaves.items);
      setRequestsTotal(leaves.total);
      setShifts(userShifts);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId, backend, requestsPage, requestsPageSize]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 15000);

    const onVisibilityOrFocus = () => {
      if (!document.hidden) {
        void loadData();
      }
    };

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [loadData]);

  useRealtime({
    userId,
    onLeaveChange: loadData,
  });

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleCreated(leave: LeaveRequest) {
    setRequests((prev) => [leave, ...prev]);
    toast.success(feedbackMessages.leaveSavedDraft);
  }

  async function handleSentToHR(leave: LeaveRequest) {
    setRequests((prev) => prev.map((r) => (r.id === leave.id ? leave : r)));
    toast.success(feedbackMessages.leaveSentToHR);
    try {
      await dispatchLeaveStatusChange(backend.notifications, leave);
    } catch {
      // non-fatal
    }
  }

  async function handleApprove(
    request: LeaveRequest,
    input: LeaveApproveInput,
  ) {
    try {
      assertLeaveStatusTransition(request.status, "approved");
    } catch {
      toast.error(invalidTransitionMessage(request.status, "aprovado"));
      return;
    }

    setBusyId(request.id);
    try {
      const updated = await runWithToast(
        () =>
          backend.leave.approveLeaveRequest(request.id, {
            approvedStartDate: input.approvedStartDate,
            approvedEndDate: input.approvedEndDate,
            hrResponseNotes: input.hrResponseNotes,
          }),
        {
          loading: "A aprovar pedido...",
          success: `Pedido ${formatLeaveStatus("approved").toLowerCase()} com sucesso.`,
        },
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      try {
        await dispatchLeaveStatusChange(backend.notifications, updated);
      } catch {
        // non-fatal
      }
    } catch {
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(request: LeaveRequest, input: LeaveRejectInput) {
    try {
      assertLeaveStatusTransition(request.status, "rejected");
    } catch {
      toast.error(invalidTransitionMessage(request.status, "rejeitado"));
      return;
    }

    setBusyId(request.id);
    try {
      const updated = await runWithToast(
        () =>
          backend.leave.rejectLeaveRequest(request.id, {
            hrResponseNotes: input.hrResponseNotes,
          }),
        {
          loading: "A rejeitar pedido...",
          success: `Pedido ${formatLeaveStatus("rejected").toLowerCase()} com sucesso.`,
        },
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      try {
        await dispatchLeaveStatusChange(backend.notifications, updated);
      } catch {
        // non-fatal
      }
    } catch {
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdateApprovedDates(
    request: LeaveRequest,
    start: string,
    end: string,
  ) {
    setBusyId(request.id);
    try {
      const updated = await runWithToast(
        () => backend.leave.updateApprovedDates(request.id, start, end),
        {
          loading: "A atualizar datas aprovadas...",
          success: "Datas aprovadas actualizadas.",
        },
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
    } catch {
    } finally {
      setBusyId(null);
    }
  }

  async function handleCalendarSync(request: LeaveRequest) {
    if (!accessToken) {
      toast.error(feedbackMessages.missingGoogleToken);
      return;
    }
    if (!defaultCalendarId) {
      toast.error(feedbackMessages.missingDefaultCalendar);
      return;
    }

    setSyncingId(request.id);
    try {
      const result = await runWithToast(
        () => syncLeaveToCalendar(request, accessToken, defaultCalendarId),
        {
          loading: "A sincronizar ausência no calendário...",
          success: (result) => {
            const actionLabel =
              result.action === "created"
                ? "Evento criado"
                : result.action === "updated"
                  ? "Evento atualizado"
                  : "Calendário já sincronizado";
            return `${actionLabel} no calendário.`;
          },
          error: (error) => `Erro ao sincronizar: ${getErrorMessage(error)}`,
        },
      );
      // Persist google_event_id + leave_uid back to DB
      const updated = await backend.leave.recordCalendarSync(request.id, {
        googleEventId: result.googleEventId,
        leaveUid: result.leaveUid,
        calendarId: result.calendarId,
      });
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
    } catch {
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(request: LeaveRequest) {
    setBusyId(request.id);
    try {
      await runWithToast(() => backend.leave.deleteLeaveRequest(request.id), {
        loading: "A eliminar pedido...",
        success: "Pedido eliminado com sucesso.",
        error: (error) => `Erro ao eliminar pedido: ${getErrorMessage(error)}`,
      });

      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      setRequestsTotal((prev) => Math.max(0, prev - 1));
    } catch {
      // handled by toast
    } finally {
      setBusyId(null);
    }
  }

  function requestDeleteConfirmation(request: LeaveRequest) {
    setDeleteTarget(request);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Gestão de Ausências
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Submeta e acompanhe pedidos de férias, doença e ausências pessoais. Os
          pedidos ficam pendentes até serem revistos pelo responsável. Pedidos
          sem resposta após 30 dias são automaticamente expirados.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
        <LeaveRequestForm
          userId={userId}
          userShifts={shifts}
          leaveService={backend.leave}
          reminderService={backend.reminders}
          hrEmail={hrEmail}
          ccEmails={ccEmails}
          employeeName={employeeName}
          employeeCode={employeeCode}
          onCreated={handleCreated}
          onSentToHR={(leave) => void handleSentToHR(leave)}
        />
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)]">
        <div className="mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
            Os Meus Pedidos
          </h3>
          <p className="text-xs text-slate-500">
            Pendentes, aprovados, rejeitados, expirados e histórico completo.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <LoadingState message="A carregar pedidos..." inline />
            <LoadingListSkeleton rows={3} />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : (
          <LeaveRequestList
            requests={requests}
            userId={userId}
            page={requestsPage}
            pageSize={requestsPageSize}
            total={requestsTotal}
            loading={loading}
            onPageChange={setRequestsPage}
            onApprove={(r, input) => void handleApprove(r, input)}
            onReject={(r, input) => void handleReject(r, input)}
            onDelete={requestDeleteConfirmation}
            onCalendarSync={(r) => void handleCalendarSync(r)}
            onUpdateApprovedDates={(r, s, e) =>
              void handleUpdateApprovedDates(r, s, e)
            }
            busyId={busyId}
            syncingId={syncingId}
          />
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar pedido de ausência</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende eliminar este pedido de ausência?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteTarget ? busyId === deleteTarget.id : false}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteTarget ? busyId === deleteTarget.id : false}
              onClick={(event) => {
                event.preventDefault();
                if (!deleteTarget) return;
                const target = deleteTarget;
                setDeleteTarget(null);
                void handleDelete(target);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void loadData()}
          className="text-xs text-slate-400 hover:text-slate-700 underline-offset-2 hover:underline"
        >
          Atualizar
        </button>
      </div>
    </motion.div>
  );
}
