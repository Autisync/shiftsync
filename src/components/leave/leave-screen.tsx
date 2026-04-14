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
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leaves, userShifts] = await Promise.all([
        backend.leave.getLeaveRequestsForUser(userId),
        backend.shifts.getShiftsForUser(userId),
      ]);
      setRequests(leaves);
      setShifts(userShifts);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId, backend]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleCreated(leave: LeaveRequest) {
    setRequests((prev) => [leave, ...prev]);
    toast.success("Pedido guardado. Use o botão 'Enviar ao RH' para submeter.");
  }

  async function handleSentToHR(leave: LeaveRequest) {
    setRequests((prev) => prev.map((r) => (r.id === leave.id ? leave : r)));
    toast.success("Email ao RH aberto. Pedido marcado como pendente.");
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
      toast.error(`Transição inválida: ${request.status} → aprovado`);
      return;
    }

    setBusyId(request.id);
    try {
      const updated = await backend.leave.approveLeaveRequest(request.id, {
        approvedStartDate: input.approvedStartDate,
        approvedEndDate: input.approvedEndDate,
        hrResponseNotes: input.hrResponseNotes,
      });
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      toast.success(
        `Pedido ${formatLeaveStatus("approved").toLowerCase()} com sucesso.`,
      );
      try {
        await dispatchLeaveStatusChange(backend.notifications, updated);
      } catch {
        // non-fatal
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(request: LeaveRequest, input: LeaveRejectInput) {
    try {
      assertLeaveStatusTransition(request.status, "rejected");
    } catch {
      toast.error(`Transição inválida: ${request.status} → rejeitado`);
      return;
    }

    setBusyId(request.id);
    try {
      const updated = await backend.leave.rejectLeaveRequest(request.id, {
        hrResponseNotes: input.hrResponseNotes,
      });
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      toast.success(
        `Pedido ${formatLeaveStatus("rejected").toLowerCase()} com sucesso.`,
      );
      try {
        await dispatchLeaveStatusChange(backend.notifications, updated);
      } catch {
        // non-fatal
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
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
      const updated = await backend.leave.updateApprovedDates(
        request.id,
        start,
        end,
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      toast.success("Datas aprovadas actualizadas.");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCalendarSync(request: LeaveRequest) {
    if (!accessToken) {
      toast.error("Sem token de acesso Google. Faz login novamente.");
      return;
    }
    if (!defaultCalendarId) {
      toast.error(
        "Nenhum calendário padrão configurado. Vai às definições e seleciona um calendário.",
      );
      return;
    }

    setSyncingId(request.id);
    try {
      const result = await syncLeaveToCalendar(
        request,
        accessToken,
        defaultCalendarId,
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

      const actionLabel =
        result.action === "created"
          ? "Evento criado"
          : result.action === "updated"
            ? "Evento atualizado"
            : "Calendário já sincronizado";
      toast.success(`${actionLabel} no calendário.`);
    } catch (err) {
      toast.error(`Erro ao sincronizar: ${getErrorMessage(err)}`);
    } finally {
      setSyncingId(null);
    }
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
          <p className="text-sm text-slate-500">A carregar pedidos...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : (
          <LeaveRequestList
            requests={requests}
            userId={userId}
            onApprove={(r, input) => void handleApprove(r, input)}
            onReject={(r, input) => void handleReject(r, input)}
            onCalendarSync={(r) => void handleCalendarSync(r)}
            onUpdateApprovedDates={(r, s, e) =>
              void handleUpdateApprovedDates(r, s, e)
            }
            busyId={busyId}
            syncingId={syncingId}
          />
        )}
      </div>

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
