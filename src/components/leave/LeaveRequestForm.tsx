/**
 * src/components/leave/LeaveRequestForm.tsx
 *
 * Full leave request creation form with send-to-HR mailto flow.
 *
 * Lifecycle:
 *   1. User fills in form → click "Guardar Pedido" → saved as draft.
 *   2. User clicks "Enviar ao RH" on the saved draft → mailto URL opens,
 *      backend marks request as pending + records sent_to_hr_at / decision_due_at.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { detectLeaveConflicts } from "@/features/leave/services/leave-conflict";
import { LEAVE_TYPES } from "@/features/leave/services/leave-workflow";
import { buildLeaveEmailTemplate } from "@/features/leave/services/leave-email-template";
import type { Shift, LeaveRequest } from "@/types/domain";
import type { LeaveService } from "@/services/backend/types";
import { AlertTriangle, Mail, Save } from "lucide-react";

interface LeaveRequestFormProps {
  userId: string;
  userShifts: Shift[];
  leaveService: LeaveService;
  hrEmail?: string;
  ccEmails?: string[];
  employeeName?: string;
  employeeCode?: string;
  onCreated: (leave: LeaveRequest) => void;
  onSentToHR?: (leave: LeaveRequest) => void;
}

export function LeaveRequestForm({
  userId,
  userShifts,
  leaveService,
  hrEmail,
  ccEmails = [],
  employeeName,
  employeeCode,
  onCreated,
  onSentToHR,
}: LeaveRequestFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState("vacation");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeaveRequest | null>(null);

  const conflictResult =
    startDate && endDate && startDate <= endDate
      ? detectLeaveConflicts(userShifts, startDate, endDate)
      : { hasConflicts: false, conflicts: [] };

  /** Step 1: Save as draft. */
  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("Selecione a data de início e fim.");
      return;
    }
    if (startDate > endDate) {
      setError("A data de fim não pode ser anterior à data de início.");
      return;
    }

    setSubmitting(true);
    try {
      const leave = await leaveService.createLeaveRequest({
        userId,
        type,
        startDate,
        endDate,
        notes: notes.trim() || null,
      });
      setDraft(leave);
      onCreated(leave);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Step 2: Open HR mailto and mark as pending. */
  async function handleSendToHR() {
    if (!draft) return;
    setError(null);

    const resolved = hrEmail?.trim();
    if (!resolved) {
      setError(
        "Configure o email do RH na secção de definições antes de enviar.",
      );
      return;
    }

    const { mailtoUrl } = buildLeaveEmailTemplate({
      leave: draft,
      hrEmail: resolved,
      ccEmails,
      employeeName,
      employeeCode,
    });

    setSending(true);
    try {
      const updated = await leaveService.markSentToHR(draft.id);
      // Open the mail client after the backend update succeeds
      window.location.href = mailtoUrl;
      setDraft(null);
      onSentToHR?.(updated);
      // Reset form
      setType("vacation");
      setStartDate(today);
      setEndDate(today);
      setNotes("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Novo Pedido de Ausência
        </h3>
        <p className="text-xs text-slate-500">
          Guarde o pedido e depois envie ao RH por email para iniciar o
          processo.
        </p>
      </div>

      <form onSubmit={(e) => void handleSaveDraft(e)} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Type */}
          <div className="sm:col-span-2">
            <label
              htmlFor="leave-type"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Tipo de ausência
            </label>
            <select
              id="leave-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              title="Tipo de ausência"
              disabled={!!draft}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start date */}
          <div>
            <label
              htmlFor="leave-start"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Data de início
            </label>
            <input
              id="leave-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              disabled={!!draft}
              title="Data de início da ausência"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            />
          </div>

          {/* End date */}
          <div>
            <label
              htmlFor="leave-end"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Data de fim
            </label>
            <input
              id="leave-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              disabled={!!draft}
              title="Data de fim da ausência"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            />
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <label
              htmlFor="leave-notes"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Observações <span className="text-slate-400">(opcional)</span>
            </label>
            <textarea
              id="leave-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={!!draft}
              placeholder="Motivo ou informação adicional..."
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Conflict warning */}
        {conflictResult.hasConflicts && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Conflito com {conflictResult.conflicts.length} turno(s)
              </p>
              <p className="mt-0.5">
                Existem turnos agendados durante o período solicitado. Pode
                guardar o pedido na mesma — o responsável irá rever.
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {!draft && (
          <Button
            type="submit"
            size="sm"
            disabled={submitting}
            className="w-full"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {submitting ? "A guardar..." : "Guardar pedido"}
          </Button>
        )}
      </form>

      {/* Step 2 — Send to HR */}
      {draft && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-xs text-emerald-800 font-medium">
            Pedido guardado. Clique abaixo para enviar o email ao RH.
          </p>
          {!hrEmail && (
            <p className="text-xs text-amber-700">
              Nenhum email de RH configurado. Configure nas definições para
              poder enviar.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={sending || !hrEmail}
              onClick={() => void handleSendToHR()}
              className="flex-1"
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              {sending ? "A enviar..." : "Enviar ao RH"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft(null)}
              className="text-slate-600"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
