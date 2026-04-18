/**
 * src/components/leave/LeaveRequestCard.tsx
 *
 * Displays a single leave request with:
 *   - Full status lifecycle (draft → pending → approved/rejected/soft_declined)
 *   - Approve/reject buttons with optional HR response notes
 *   - Editable approved dates for férias before calendar sync
 *   - Calendar sync button for approved requests
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeaveRequest, LeaveRequestStatus } from "@/types/domain";
import {
  formatLeaveStatus,
  getLeaveStatusBadgeClass,
  getLeaveTypeLabel,
  formatLeaveDate,
  getLeaveDurationDays,
  isVacationType,
  getEffectiveLeaveDates,
} from "@/features/leave/services/leave-workflow";
import { canLeaveStatusTransition } from "@/features/leave/services/leave-workflow";
import { CalendarDays, Calendar, Pencil, Check, X } from "lucide-react";

export interface LeaveApproveInput {
  approvedStartDate?: string;
  approvedEndDate?: string;
  hrResponseNotes?: string;
}

export interface LeaveRejectInput {
  hrResponseNotes?: string;
}

interface LeaveRequestCardProps {
  request: LeaveRequest;
  /** Whether the current user can approve/reject. */
  canReview?: boolean;
  onApprove?: (request: LeaveRequest, input: LeaveApproveInput) => void;
  onReject?: (request: LeaveRequest, input: LeaveRejectInput) => void;
  onCalendarSync?: (request: LeaveRequest) => void;
  onUpdateApprovedDates?: (
    request: LeaveRequest,
    start: string,
    end: string,
  ) => void;
  onDelete?: (request: LeaveRequest) => void;
  busy?: boolean;
  calendarSyncing?: boolean;
}

export function LeaveRequestCard({
  request,
  canReview = false,
  onApprove,
  onReject,
  onCalendarSync,
  onUpdateApprovedDates,
  onDelete,
  busy = false,
  calendarSyncing = false,
}: LeaveRequestCardProps) {
  const effective = getEffectiveLeaveDates(request);
  const duration = getLeaveDurationDays(effective.startDate, effective.endDate);

  const canApprove =
    canReview && canLeaveStatusTransition(request.status, "approved");
  const canReject =
    canReview && canLeaveStatusTransition(request.status, "rejected");
  const isApproved = request.status === "approved";
  const isVacation = isVacationType(request.type);
  const canDelete =
    Boolean(onDelete) &&
    (request.status === "draft" ||
      request.status === "pending" ||
      request.status === "rejected" ||
      request.status === "soft_declined");

  // ── Inline approval state ────────────────────────────────────────────────
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [approveStart, setApproveStart] = useState(effective.startDate);
  const [approveEnd, setApproveEnd] = useState(effective.endDate);
  const [hrNotes, setHrNotes] = useState("");

  // ── Inline date-edit state (post-approval, before sync) ─────────────────
  const [editingDates, setEditingDates] = useState(false);
  const [editStart, setEditStart] = useState(effective.startDate);
  const [editEnd, setEditEnd] = useState(effective.endDate);

  function handleApprove() {
    const input: LeaveApproveInput = {
      approvedStartDate: approveStart,
      approvedEndDate: approveEnd,
      hrResponseNotes: hrNotes.trim() || undefined,
    };
    onApprove?.(request, input);
    setShowApproveForm(false);
    setHrNotes("");
  }

  function handleReject() {
    const input: LeaveRejectInput = {
      hrResponseNotes: hrNotes.trim() || undefined,
    };
    onReject?.(request, input);
    setHrNotes("");
  }

  function handleSaveDates() {
    if (editStart > editEnd) return;
    onUpdateApprovedDates?.(request, editStart, editEnd);
    setEditingDates(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_6px_20px_-18px_rgba(15,23,42,0.45)] space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-slate-900 truncate">
            {getLeaveTypeLabel(request.type)}
          </p>
        </div>
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getLeaveStatusBadgeClass(request.status)}`}
        >
          {formatLeaveStatus(request.status)}
        </span>
      </div>

      {/* Date range (effective/approved if set) */}
      <div className="text-xs text-slate-600 space-y-0.5">
        <p>
          <span className="text-slate-400">De:</span>{" "}
          {formatLeaveDate(effective.startDate)}
          {request.approvedStartDate &&
            request.approvedStartDate !== request.startDate && (
              <span className="ml-1.5 text-emerald-600 text-[10px]">
                (ajustado)
              </span>
            )}
        </p>
        <p>
          <span className="text-slate-400">Até:</span>{" "}
          {formatLeaveDate(effective.endDate)}
          {request.approvedEndDate &&
            request.approvedEndDate !== request.endDate && (
              <span className="ml-1.5 text-emerald-600 text-[10px]">
                (ajustado)
              </span>
            )}
        </p>
        <p className="text-slate-500">
          {duration} dia{duration !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Notes */}
      {request.notes && (
        <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-1.5">
          {request.notes}
        </p>
      )}

      {/* HR response notes */}
      {request.hrResponseNotes && (
        <p className="text-xs text-slate-500 border-t border-slate-100 pt-1.5">
          <span className="font-medium text-slate-700">RH: </span>
          {request.hrResponseNotes}
        </p>
      )}

      {/* Soft declined info */}
      {request.status === "soft_declined" && request.softDeclinedAt && (
        <p className="text-xs text-zinc-500 border-t border-slate-100 pt-1.5">
          Expirou em {formatLeaveDate(request.softDeclinedAt.slice(0, 10))} após
          30 dias sem resposta.
        </p>
      )}

      {/* Calendar sync info */}
      {isApproved && request.calendarAppliedAt && (
        <p className="text-xs text-emerald-600 border-t border-slate-100 pt-1.5">
          Sincronizado ao calendário em{" "}
          {formatLeaveDate(request.calendarAppliedAt.slice(0, 10))}.
        </p>
      )}

      {/* ── Approve form (inline) ─────────────────────────────────────────── */}
      {showApproveForm && (
        <div className="border-t border-slate-100 pt-2 space-y-2">
          <p className="text-xs font-medium text-slate-700">
            Confirmar aprovação
          </p>

          {isVacation && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor={`apv-start-${request.id}`}
                  className="block text-[10px] text-slate-500 mb-0.5"
                >
                  Início aprovado
                </label>
                <input
                  id={`apv-start-${request.id}`}
                  type="date"
                  value={approveStart}
                  onChange={(e) => setApproveStart(e.target.value)}
                  title="Data início aprovada"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor={`apv-end-${request.id}`}
                  className="block text-[10px] text-slate-500 mb-0.5"
                >
                  Fim aprovado
                </label>
                <input
                  id={`apv-end-${request.id}`}
                  type="date"
                  value={approveEnd}
                  min={approveStart}
                  onChange={(e) => setApproveEnd(e.target.value)}
                  title="Data fim aprovada"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor={`hr-notes-${request.id}`}
              className="block text-[10px] text-slate-500 mb-0.5"
            >
              Notas RH (opcional)
            </label>
            <input
              id={`hr-notes-${request.id}`}
              type="text"
              value={hrNotes}
              onChange={(e) => setHrNotes(e.target.value)}
              placeholder="Notas do RH..."
              title="Notas do RH"
              maxLength={500}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={handleApprove}
              className="flex-1"
            >
              <Check className="h-3 w-3 mr-1" /> Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowApproveForm(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Reject inline note ────────────────────────────────────────────── */}
      {/* (Only shown when approve form is NOT shown and canReject) */}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      {!showApproveForm &&
        (canApprove ||
          canReject ||
          canDelete ||
          (isApproved && onCalendarSync) ||
          (isApproved && isVacation && onUpdateApprovedDates)) && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2">
            {canApprove && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => setShowApproveForm(true)}
              >
                Aprovar
              </Button>
            )}
            {canReject && onReject && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => handleReject()}
              >
                Rejeitar
              </Button>
            )}

            {canDelete && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="text-rose-700 border-rose-200 hover:bg-rose-50"
                onClick={() => onDelete?.(request)}
              >
                Eliminar
              </Button>
            )}

            {/* Approved férias: edit dates before sync */}
            {isApproved &&
              isVacation &&
              onUpdateApprovedDates &&
              (editingDates ? (
                <div className="w-full space-y-1.5 border-t border-slate-100 pt-2">
                  <p className="text-[10px] font-medium text-slate-600">
                    Editar datas aprovadas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      title="Nova data de início"
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <input
                      type="date"
                      value={editEnd}
                      min={editStart}
                      onChange={(e) => setEditEnd(e.target.value)}
                      title="Nova data de fim"
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={handleSaveDates}
                      disabled={editStart > editEnd}
                    >
                      <Check className="h-3 w-3 mr-1" /> Guardar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingDates(false)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditStart(effective.startDate);
                    setEditEnd(effective.endDate);
                    setEditingDates(true);
                  }}
                >
                  <Pencil className="h-3 w-3 mr-1" /> Editar datas
                </Button>
              ))}

            {/* Calendar sync */}
            {isApproved && onCalendarSync && (
              <Button
                size="sm"
                variant="outline"
                disabled={calendarSyncing || busy}
                onClick={() => onCalendarSync(request)}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Calendar className="h-3 w-3 mr-1" />
                {calendarSyncing
                  ? "A sincronizar..."
                  : request.calendarAppliedAt
                    ? "Sincronizar novamente"
                    : "Sincronizar calendário"}
              </Button>
            )}
          </div>
        )}
    </div>
  );
}
