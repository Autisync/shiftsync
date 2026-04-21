type ReminderReason =
  | "request_created"
  | "awaiting_peer_decision"
  | "submitted_to_hr"
  | "awaiting_hr_decision"
  | "status_update";

export interface SwapReminderTemplateInput {
  recipientName: string;
  reason: ReminderReason;
  requestId: string;
  status: string;
  requesterName: string;
  requesterCode: string;
  targetName: string;
  targetCode: string;
  requesterShiftLabel: string;
  targetShiftLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveReminderTemplateInput {
  recipientName: string;
  reason: ReminderReason;
  requestId: string;
  status: string;
  ownerName: string;
  ownerCode: string;
  leaveType: string;
  leavePeriod: string;
  createdAt: string;
  updatedAt: string;
}

export function mapReminderReasonLabel(reason: ReminderReason): string {
  switch (reason) {
    case "request_created":
      return "Pedido criado";
    case "awaiting_peer_decision":
      return "A aguardar decisão do colega";
    case "submitted_to_hr":
      return "Submetido ao RH";
    case "awaiting_hr_decision":
      return "A aguardar decisão do RH";
    case "status_update":
      return "Atualização de estado";
    default:
      return "Lembrete";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapHtmlCard(content: string): string {
  return `
    <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background:linear-gradient(120deg,#1e293b,#0f172a);color:#f8fafc;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.85;">ShiftSync</div>
            <h2 style="margin:8px 0 0;font-size:22px;line-height:1.2;">Lembrete do pedido</h2>
            <p style="margin:10px 0 0;font-size:14px;opacity:.95;">Resumo claro para acompanhar a decisão e os próximos passos.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;">${content}</td>
        </tr>
      </table>
    </div>
  `;
}

export function buildSwapReminderTemplate(input: SwapReminderTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const reasonLabel = mapReminderReasonLabel(input.reason);
  const subject = `[ShiftSync] Lembrete de troca: ${input.requesterName} ↔ ${input.targetName}`;

  const text = [
    `Olá ${input.recipientName},`,
    "",
    `Lembrete: ${reasonLabel}`,
    `Pedido: ${input.requestId}`,
    `Estado atual: ${input.status}`,
    "",
    "Mudança de turno (por quem e para quê):",
    `- Pedido por: ${input.requesterName} (${input.requesterCode})`,
    `- Com: ${input.targetName} (${input.targetCode})`,
    "- Alteração pretendida: troca de turnos entre ambos para ajustar o planeamento.",
    `- Turno do requerente: ${input.requesterShiftLabel}`,
    `- Turno do colega: ${input.targetShiftLabel}`,
    "",
    `Criado em: ${input.createdAt}`,
    `Última atualização: ${input.updatedAt}`,
    "",
    "Abra o ShiftSync para acompanhar ou tomar ação neste pedido.",
  ].join("\n");

  const html = wrapHtmlCard(`
    <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(
      reasonLabel,
    )}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-collapse:separate;border-spacing:0 8px;">
      <tr><td style="font-size:13px;color:#475569;width:180px;">Pedido</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        input.requestId,
      )}</td></tr>
      <tr><td style="font-size:13px;color:#475569;">Estado atual</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        input.status,
      )}</td></tr>
      <tr><td style="font-size:13px;color:#475569;">Pedido por</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        `${input.requesterName} (${input.requesterCode})`,
      )}</td></tr>
      <tr><td style="font-size:13px;color:#475569;">Com</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        `${input.targetName} (${input.targetCode})`,
      )}</td></tr>
    </table>

    <div style="margin-top:14px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;">Mudança de turno (por quem e para quê)</div>
      <div style="margin-top:8px;font-size:14px;">Pedido por <strong>${escapeHtml(
        input.requesterName,
      )}</strong> para trocar turnos com <strong>${escapeHtml(
        input.targetName,
      )}</strong>.</div>
      <div style="margin-top:6px;font-size:14px;"><strong>Turno do requerente:</strong> ${escapeHtml(
        input.requesterShiftLabel,
      )}</div>
      <div style="margin-top:4px;font-size:14px;"><strong>Turno do colega:</strong> ${escapeHtml(
        input.targetShiftLabel,
      )}</div>
    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;">Abra o ShiftSync para acompanhar este pedido e decidir os próximos passos.</p>
  `);

  return { subject, text, html };
}

export function buildLeaveReminderTemplate(input: LeaveReminderTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const reasonLabel = mapReminderReasonLabel(input.reason);
  const subject = `[ShiftSync] Lembrete de ausência: ${input.ownerName}`;

  const text = [
    `Olá ${input.recipientName},`,
    "",
    `Lembrete: ${reasonLabel}`,
    `Pedido: ${input.requestId}`,
    `Estado atual: ${input.status}`,
    "",
    "Alteração solicitada (por quem e para quê):",
    `- Pedido por: ${input.ownerName} (${input.ownerCode})`,
    "- Alteração pretendida: atualização do planeamento de ausências.",
    `- Tipo: ${input.leaveType}`,
    `- Período: ${input.leavePeriod}`,
    "",
    `Criado em: ${input.createdAt}`,
    `Última atualização: ${input.updatedAt}`,
    "",
    "Abra o ShiftSync para acompanhar este pedido.",
  ].join("\n");

  const html = wrapHtmlCard(`
    <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(
      reasonLabel,
    )}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-collapse:separate;border-spacing:0 8px;">
      <tr><td style="font-size:13px;color:#475569;width:180px;">Pedido</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        input.requestId,
      )}</td></tr>
      <tr><td style="font-size:13px;color:#475569;">Estado atual</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        input.status,
      )}</td></tr>
      <tr><td style="font-size:13px;color:#475569;">Pedido por</td><td style="font-size:14px;font-weight:600;">${escapeHtml(
        `${input.ownerName} (${input.ownerCode})`,
      )}</td></tr>
    </table>

    <div style="margin-top:14px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;">Alteração solicitada (por quem e para quê)</div>
      <div style="margin-top:8px;font-size:14px;">Pedido por <strong>${escapeHtml(
        input.ownerName,
      )}</strong> para atualizar o planeamento de ausências.</div>
      <div style="margin-top:6px;font-size:14px;"><strong>Tipo:</strong> ${escapeHtml(
        input.leaveType,
      )}</div>
      <div style="margin-top:4px;font-size:14px;"><strong>Período:</strong> ${escapeHtml(
        input.leavePeriod,
      )}</div>
    </div>

    <p style="margin:16px 0 0;font-size:12px;color:#64748b;">Abra o ShiftSync para acompanhar o estado deste pedido.</p>
  `);

  return { subject, text, html };
}
