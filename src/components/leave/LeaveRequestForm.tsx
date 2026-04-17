/**
 * src/components/leave/LeaveRequestForm.tsx
 *
 * Leave request creation with preview-confirm flow.
 */

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { detectLeaveConflicts } from "@/features/leave/services/leave-conflict";
import {
  LEAVE_TYPES,
  isVacationType,
} from "@/features/leave/services/leave-workflow";
import type { Shift, LeaveRequest } from "@/types/domain";
import type {
  EmailPreviewPayload,
  LeaveService,
  ReminderService,
} from "@/services/backend/types";
import { AlertTriangle, Mail, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LeaveRequestFormProps {
  userId: string;
  userShifts: Shift[];
  leaveService: LeaveService;
  reminderService?: ReminderService;
  hrEmail?: string;
  ccEmails?: string[];
  employeeName?: string;
  employeeCode?: string;
  onCreated: (leave: LeaveRequest) => void;
  onSentToHR?: (leave: LeaveRequest) => void;
}

const NOTICE_POLICY_DAYS = 45;

function daysUntil(dateIso: string): number {
  const start = new Date(`${dateIso}T00:00:00`).getTime();
  const now = new Date();
  const nowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.floor((start - nowStart) / (24 * 60 * 60 * 1000));
}

export function LeaveRequestForm({
  userId,
  userShifts,
  leaveService,
  reminderService,
  hrEmail,
  ccEmails = [],
  employeeName,
  employeeCode,
  onCreated,
  onSentToHR,
}: LeaveRequestFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState("vacation");
  // For vacation: use DateRange from react-day-picker; for other types: two text inputs
  const [vacationRange, setVacationRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  const isVacation = isVacationType(type);

  // Derive effective start/end dates based on leave type
  const effectiveStart = isVacation
    ? vacationRange?.from
      ? vacationRange.from.toISOString().slice(0, 10)
      : ""
    : startDate;
  const effectiveEnd = isVacation
    ? vacationRange?.to
      ? vacationRange.to.toISOString().slice(0, 10)
      : effectiveStart
    : endDate;

  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeaveRequest | null>(null);
  const [preview, setPreview] = useState<EmailPreviewPayload | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isSpotRequest = type === "personal";
  const noticeDays = daysUntil(effectiveStart);
  const insideNoticeWindow = isSpotRequest && noticeDays < NOTICE_POLICY_DAYS;

  const conflictResult =
    effectiveStart && effectiveEnd && effectiveStart <= effectiveEnd
      ? detectLeaveConflicts(userShifts, effectiveStart, effectiveEnd)
      : { hasConflicts: false, conflicts: [] };

  const canSubmit = useMemo(() => {
    if (!effectiveStart || !effectiveEnd) return false;
    if (effectiveStart > effectiveEnd) return false;
    if (!isVacation && attachments.length === 0) return false;
    return true;
  }, [attachments.length, effectiveEnd, effectiveStart, isVacation]);

  async function handleSaveAndPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError(
        !isVacation && attachments.length === 0
          ? "Anexe pelo menos um ficheiro para este tipo de ausência."
          : "Preencha corretamente as datas do pedido.",
      );
      return;
    }

    const resolvedHr = hrEmail?.trim();
    if (!resolvedHr) {
      setError("Configure o email do RH nas definições antes de guardar.");
      return;
    }

    setSubmitting(true);
    try {
      const leave = await leaveService.createLeaveRequest({
        userId,
        type,
        startDate: effectiveStart,
        endDate: effectiveEnd,
        notes: notes.trim() || null,
      });

      const previewPayload = await leaveService.createLeaveEmailPreview({
        leaveRequestId: leave.id,
        hrEmail: resolvedHr,
        ccEmails,
        employeeName,
        employeeCode,
        attachments: attachments.map((file) => ({
          fileName: file.name,
          fileType: file.type || null,
          fileSize: file.size,
          storagePath: null,
        })),
      });

      if (insideNoticeWindow && reminderService) {
        const remindAt = new Date();
        remindAt.setDate(remindAt.getDate() + 2);
        await reminderService.createReminder({
          userId,
          type: "days_off_selection",
          triggerAt: remindAt.toISOString(),
          payload: {
            leave_request_id: leave.id,
            desired_start_date: effectiveStart,
            desired_end_date: effectiveEnd,
            notice_days: noticeDays,
            policy_days: NOTICE_POLICY_DAYS,
          },
        });
      }

      setDraft(leave);
      setPreview(previewPayload);
      setPreviewOpen(true);
      onCreated(leave);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmSend() {
    if (!draft || !preview) return;
    setError(null);
    setConfirming(true);

    try {
      const updated = await leaveService.confirmLeaveSubmission({
        leaveRequestId: draft.id,
        emailPreview: preview,
        attachments: attachments.map((file) => ({
          fileName: file.name,
          fileType: file.type || null,
          fileSize: file.size,
          storagePath: null,
        })),
      });

      onSentToHR?.(updated);
      setPreviewOpen(false);
      setDraft(null);
      setPreview(null);
      setType("vacation");
      setStartDate(today);
      setEndDate(today);
      setVacationRange(undefined);
      setNotes("");
      setAttachments([]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Novo Pedido de Ausência
        </h3>
        <p className="text-xs text-slate-500">
          Guarde, reveja o email e confirme o envio final ao RH.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSaveAndPreview(e)}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="leave-type"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Tipo de ausência
            </label>
            <select
              id="leave-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              title="Tipo de ausência"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {isVacation ? (
            /* ── Vacation: visual date-range calendar picker ── */
            <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-700">
                Intervalo de férias
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal text-sm"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                    {vacationRange?.from ? (
                      vacationRange.to ? (
                        <>
                          {format(vacationRange.from, "dd/MM/yyyy")} —{" "}
                          {format(vacationRange.to, "dd/MM/yyyy")}
                        </>
                      ) : (
                        format(vacationRange.from, "dd/MM/yyyy")
                      )
                    ) : (
                      <span className="text-slate-400">
                        Selecione o período
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={vacationRange}
                    onSelect={setVacationRange}
                    numberOfMonths={2}
                    disabled={{ before: new Date() }}
                  />
                </PopoverContent>
              </Popover>
              {vacationRange?.from && vacationRange?.to && (
                <p className="mt-2 text-xs text-slate-500">
                  Duração:{" "}
                  {Math.round(
                    (vacationRange.to.getTime() -
                      vacationRange.from.getTime()) /
                      (1000 * 60 * 60 * 24),
                  ) + 1}{" "}
                  dias
                </p>
              )}
            </div>
          ) : (
            /* ── Other leave types: two plain date inputs ── */
            <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-700">
                Datas desejadas
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="leave-start"
                    className="mb-1 block text-xs font-medium text-slate-700"
                  >
                    Data de início
                  </label>
                  <input
                    id="leave-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    title="Data de início da ausência"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="leave-end"
                    className="mb-1 block text-xs font-medium text-slate-700"
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
                    title="Data de fim da ausência"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>
            </div>
          )}

          {!isVacation && (
            <div className="sm:col-span-2">
              <label
                htmlFor="leave-attachment"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                Anexos
              </label>
              <input
                id="leave-attachment"
                type="file"
                multiple
                onChange={(e) =>
                  setAttachments(Array.from(e.target.files ?? []))
                }
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500">
                Para este tipo de ausência, pelo menos um anexo é obrigatório.
              </p>
            </div>
          )}

          <div className="sm:col-span-2">
            <label
              htmlFor="leave-notes"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Observações <span className="text-slate-400">(opcional)</span>
            </label>
            <textarea
              id="leave-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Motivo ou informação adicional..."
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>

        {insideNoticeWindow && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este pedido pontual está dentro da janela de aviso (
            {NOTICE_POLICY_DAYS} dias). Recomenda-se submeter com maior
            antecedência. Um lembrete será agendado.
          </div>
        )}

        {conflictResult.hasConflicts && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Conflito com {conflictResult.conflicts.length} turno(s)
              </p>
              <p className="mt-0.5">
                Existem turnos durante o período solicitado. O pedido pode ser
                guardado na mesma.
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="sm"
          disabled={submitting || !canSubmit}
          className="w-full"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {submitting ? "A preparar pré-visualização..." : "Guardar pedido"}
        </Button>
      </form>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pré-visualização do Email</DialogTitle>
            <DialogDescription>
              Confirme o conteúdo exato antes do envio final ao RH.
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>
                <span className="font-semibold">Assunto:</span>{" "}
                {preview.subject}
              </p>
              <p>
                <span className="font-semibold">Para:</span>{" "}
                {preview.to.join(", ")}
              </p>
              <p>
                <span className="font-semibold">CC:</span>{" "}
                {preview.cc.length > 0 ? preview.cc.join(", ") : "-"}
              </p>
              <div>
                <p className="mb-1 font-semibold">Corpo:</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-xs text-slate-800">
                  {preview.body}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-semibold">Anexos:</p>
                {preview.attachments.length === 0 ? (
                  <p>-</p>
                ) : (
                  <ul className="space-y-1">
                    {preview.attachments.map((item) => (
                      <li key={`${item.fileName}-${item.fileSize ?? 0}`}>
                        {item.fileName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={confirming}
            >
              Fechar
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmSend()}
              disabled={confirming}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              {confirming ? "A enviar..." : "Confirmar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
