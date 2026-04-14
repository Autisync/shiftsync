/**
 * src/features/leave/services/leave-email-template.ts
 *
 * Builds a mailto: URL for the HR leave-request email.
 * Pure function — no fetch, no side effects.
 * The caller is responsible for opening the URL (window.location.href).
 */

import type { LeaveRequest } from "@/types/domain";
import {
  getLeaveTypeLabel,
  formatLeaveDate,
  getLeaveDurationDays,
} from "./leave-workflow";

export interface LeaveEmailInput {
  leave: LeaveRequest;
  hrEmail: string;
  ccEmails?: string[];
  employeeName?: string;
  employeeCode?: string;
}

export interface LeaveEmailTemplate {
  subject: string;
  body: string;
  mailtoUrl: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function nowPT(): string {
  return new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildLeaveEmailTemplate(
  input: LeaveEmailInput,
): LeaveEmailTemplate {
  const {
    leave,
    hrEmail,
    ccEmails = [],
    employeeName = "",
    employeeCode = "",
  } = input;
  const typeLabel = getLeaveTypeLabel(leave.type);
  const startLabel = formatLeaveDate(leave.startDate);
  const endLabel = formatLeaveDate(leave.endDate);
  const duration = getLeaveDurationDays(leave.startDate, leave.endDate);
  const today = nowPT();

  const identity = [
    employeeName ? `Colaborador: ${employeeName}` : null,
    employeeCode ? `Código:      ${employeeCode}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const subject = `Pedido de Ausência — ${typeLabel} — ${startLabel} a ${endLabel}`;

  const body = `Exm.ª RH,

Venho por este meio solicitar uma ausência do tipo "${typeLabel}".

${identity ? identity + "\n\n" : ""}Período solicitado:
  Início: ${startLabel}
  Fim:    ${endLabel}
  Duração: ${duration} dia${duration !== 1 ? "s" : ""} (${startLabel} a ${endLabel})

${leave.notes ? `Observações:\n  ${leave.notes}\n\n` : ""}Data do pedido: ${today}

Aguardo a vossa resposta.

Com os melhores cumprimentos.`;

  const params = new URLSearchParams();
  params.set("subject", subject);
  params.set("body", body);
  if (ccEmails.length > 0) {
    params.set("cc", ccEmails.join(","));
  }

  // URLSearchParams encodes spaces as '+'; replace with %20 for mailto compatibility
  const mailtoUrl = `mailto:${encodeURIComponent(hrEmail)}?${params.toString().replace(/\+/g, "%20")}`;

  return { subject, body, mailtoUrl };
}
