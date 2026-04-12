/**
 * src/lib/swap-email-template.ts
 *
 * Generates HR email templates for swap requests.
 * Uses mailto links (no external API, just plain text).
 */

import type { Shift, SwapRequest, UserProfile } from "@/types/domain";
import { formatSwapStatus } from "@/features/swaps/services/swap-workflow";

export interface EmailTemplateInput {
  request: SwapRequest;
  requester: UserProfile;
  target: UserProfile;
  requesterShift: Shift;
  targetShift: Shift | null;
  hrEmail: string;
  ccEmails: string[];
}

function formatDateTime(isoString: string): string {
  const dt = new Date(isoString);
  return dt.toLocaleString("pt-PT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getShiftDuration(shift: Shift): string {
  const start = new Date(shift.startsAt);
  const end = new Date(shift.endsAt);
  const ms = end.getTime() - start.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function generateSwapEmailTemplate(input: EmailTemplateInput): {
  subject: string;
  body: string;
  to: string;
  cc: string;
} {
  const requesterName =
    input.requester.fullName || input.requester.email || "?";
  const targetName = input.target.fullName || input.target.email || "?";
  const requesterCode = input.requester.employeeCode;
  const targetCode = input.target.employeeCode;

  const reqShiftDate = new Date(input.requesterShift.date).toLocaleDateString(
    "pt-PT",
  );
  const reqShiftTime = `${new Date(input.requesterShift.startsAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(input.requesterShift.endsAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;

  let swapResult = "Troca parcial (sem shift alvo)";
  if (input.targetShift) {
    const tgtShiftDate = new Date(input.targetShift.date).toLocaleDateString(
      "pt-PT",
    );
    const tgtShiftTime = `${new Date(input.targetShift.startsAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(input.targetShift.endsAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
    swapResult = `Troca bilateral:\n  ${requesterName} (${requesterCode}): ${reqShiftDate} ${reqShiftTime}\n  ${targetName} (${targetCode}): ${tgtShiftDate} ${tgtShiftTime}`;
  }

  const status = formatSwapStatus(input.request.status);
  const violation = input.request.ruleViolation
    ? `\nViolação de Regra: ${input.request.ruleViolation}\n${input.request.violationReason || ""}`
    : "Sem violações detectadas";

  const summary = `
PEDIDO DE TROCA DE TURNO

Requerente: ${requesterName} (${requesterCode})
Alvo: ${targetName} (${targetCode})
Status: ${status}

Turno Requerente:
  Data: ${reqShiftDate}
  Hora: ${reqShiftTime}
  Duração: ${getShiftDuration(input.requesterShift)}

${
  input.targetShift
    ? `Turno Alvo:
  Data: ${new Date(input.targetShift.date).toLocaleDateString("pt-PT")}
  Hora: ${new Date(input.targetShift.startsAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(input.targetShift.endsAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
  Duração: ${getShiftDuration(input.targetShift)}`
    : ""
}

Resultado da Troca:
${swapResult}

Validação de Restrições:
${violation}

ID do Pedido: ${input.request.id}
Criado em: ${formatDateTime(input.request.createdAt)}
Atualizado em: ${formatDateTime(input.request.updatedAt)}

---
Este email foi gerado automaticamente pelo ShiftSync.
Confirme manualmente no sistema antes de processar a troca.
  `.trim();

  const subject = `Pedido de Troca de Turno - ${requesterName} ↔ ${targetName}`;
  const cc = input.ccEmails.join(",");

  return {
    subject,
    body: summary,
    to: input.hrEmail,
    cc,
  };
}

export function generateMailtoLink(
  subject: string,
  body: string,
  to: string,
  cc: string,
): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const encodedCc = encodeURIComponent(cc);
  return `mailto:${to}?cc=${encodedCc}&subject=${encodedSubject}&body=${encodedBody}`;
}

export function generateGmailComposeLink(
  subject: string,
  body: string,
  to: string,
  cc: string,
): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to,
    su: subject,
    body,
  });
  if (cc) {
    params.set("cc", cc);
  }
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function generateOutlookComposeLink(
  subject: string,
  body: string,
  to: string,
  cc: string,
): string {
  const params = new URLSearchParams({
    path: "/mail/action/compose",
    to,
    subject,
    body,
  });
  if (cc) {
    params.set("cc", cc);
  }
  return `https://outlook.office.com/mail/0/deeplink/compose?${params.toString()}`;
}
