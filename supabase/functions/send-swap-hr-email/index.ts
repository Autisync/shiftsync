import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { buildHrCcList, isValidEmail } from "../_shared/hr-email-policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") ?? "ShiftSync <no-reply@shiftsync.app>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendSwapHREmailPayload {
  request_id: string;
  actor_user_id?: string | null;
  hr_email: string;
  cc_emails?: string[];
  approve_url: string;
  decline_url: string;
  expires_at: string;
}

interface ProviderSendPayload {
  hr_email: string;
  cc_emails: string[];
  subject: string;
  text: string;
  html: string;
}

interface SwapEmailContext {
  requestId: string;
  createdAt: string | null;
  expiresAt: string;
  requesterName: string;
  requesterCode: string;
  targetName: string;
  targetCode: string;
  requesterShiftLabel: string;
  targetShiftLabel: string;
  violationLabel: string | null;
  violationReason: string | null;
  approveUrl: string;
  declineUrl: string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTimePt(value: string | null | undefined): string {
  if (!value) {
    return "N/D";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/D";
  }

  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShiftLabel(shift: Record<string, unknown> | null): string {
  if (!shift) {
    return "Turno indisponível";
  }

  const date =
    typeof shift.date === "string"
      ? new Date(`${shift.date}T00:00:00`)
      : new Date(NaN);
  const startsAt =
    typeof shift.starts_at === "string" ? new Date(shift.starts_at) : null;
  const endsAt =
    typeof shift.ends_at === "string" ? new Date(shift.ends_at) : null;

  if (
    !startsAt ||
    !endsAt ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime())
  ) {
    return "Turno indisponível";
  }

  const datePart = Number.isNaN(date.getTime())
    ? startsAt.toLocaleDateString("pt-PT")
    : date.toLocaleDateString("pt-PT");
  const startPart = startsAt.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endPart = endsAt.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${datePart}, ${startPart}-${endPart}`;
}

function buildSwapEmailText(context: SwapEmailContext): string {
  const lines = [
    "Olá RH,",
    "",
    "Existe um pedido de troca de turno pendente de decisão.",
    "",
    "Resumo:",
    `- Pedido: ${context.requestId}`,
    `- Criado em: ${formatDateTimePt(context.createdAt)}`,
    `- Validade da decisão: ${formatDateTimePt(context.expiresAt)}`,
    "",
    "Participantes:",
    `- Requerente: ${context.requesterName} (${context.requesterCode})`,
    `- Colega: ${context.targetName} (${context.targetCode})`,
    "",
    "Mudança de turno (por quem e para quê):",
    `- Pedido por: ${context.requesterName} (${context.requesterCode})`,
    `- Alteração pretendida: trocar turnos com ${context.targetName} (${context.targetCode}) para ajustar o planeamento.`,
    "",
    "Turnos propostos:",
    `- Turno do requerente: ${context.requesterShiftLabel}`,
    `- Turno do colega: ${context.targetShiftLabel}`,
  ];

  if (context.violationLabel) {
    lines.push(
      "",
      "Validação de regras:",
      `- Atenção: ${context.violationLabel}`,
    );
    if (context.violationReason) {
      lines.push(`- Detalhe: ${context.violationReason}`);
    }
  }

  lines.push(
    "",
    "Ações:",
    `- Aprovar: ${context.approveUrl}`,
    `- Recusar: ${context.declineUrl}`,
    "",
    "Este link é de uso único.",
    "",
    "ShiftSync",
  );

  return lines.join("\n");
}

function buildSwapEmailHtml(context: SwapEmailContext): string {
  const violationHtml = context.violationLabel
    ? `<div style="margin-top:16px;padding:12px 14px;border-radius:12px;border:1px solid #fecaca;background:#fef2f2;color:#7f1d1d;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Validação de Regras</div>
        <div style="font-size:14px;font-weight:600;">${escapeHtml(context.violationLabel)}</div>
        ${
          context.violationReason
            ? `<div style="font-size:13px;margin-top:4px;line-height:1.45;">${escapeHtml(context.violationReason)}</div>`
            : ""
        }
      </div>`
    : "";

  return `
    <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background:linear-gradient(120deg,#0f172a,#1e293b);color:#f8fafc;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.85;">ShiftSync RH</div>
            <h2 style="margin:8px 0 0;font-size:22px;line-height:1.2;">Decisão necessária para troca de turno</h2>
            <p style="margin:10px 0 0;font-size:14px;opacity:.9;">Avalie o pedido e escolha uma ação rápida abaixo.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;">
            <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Ação pendente</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-collapse:separate;border-spacing:0 8px;">
              <tr><td style="font-size:13px;color:#475569;width:170px;">Pedido</td><td style="font-size:14px;font-weight:600;">${escapeHtml(context.requestId)}</td></tr>
              <tr><td style="font-size:13px;color:#475569;">Criado em</td><td style="font-size:14px;font-weight:600;">${escapeHtml(formatDateTimePt(context.createdAt))}</td></tr>
              <tr><td style="font-size:13px;color:#475569;">Expira em</td><td style="font-size:14px;font-weight:700;color:#7c2d12;">${escapeHtml(formatDateTimePt(context.expiresAt))}</td></tr>
            </table>

            <div style="margin-top:18px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;">Participantes</div>
              <div style="margin-top:8px;font-size:14px;"><strong>Requerente:</strong> ${escapeHtml(context.requesterName)} (${escapeHtml(context.requesterCode)})</div>
              <div style="margin-top:4px;font-size:14px;"><strong>Colega:</strong> ${escapeHtml(context.targetName)} (${escapeHtml(context.targetCode)})</div>
            </div>

            <div style="margin-top:14px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;">Mudança de turno (por quem e para quê)</div>
              <div style="margin-top:8px;font-size:14px;">Pedido por <strong>${escapeHtml(context.requesterName)}</strong> para trocar turnos com <strong>${escapeHtml(context.targetName)}</strong>.</div>
            </div>

            <div style="margin-top:14px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;">Turnos em troca</div>
              <div style="margin-top:8px;font-size:14px;"><strong>Requerente:</strong> ${escapeHtml(context.requesterShiftLabel)}</div>
              <div style="margin-top:4px;font-size:14px;"><strong>Colega:</strong> ${escapeHtml(context.targetShiftLabel)}</div>
            </div>

            ${violationHtml}

            <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
              <a href="${escapeHtml(context.approveUrl)}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">Aprovar troca</a>
              <a href="${escapeHtml(context.declineUrl)}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">Recusar troca</a>
            </div>

            <p style="margin:16px 0 0;font-size:12px;color:#64748b;">Os links são de uso único e deixam de funcionar após a validade.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function sendViaResend(
  payload: ProviderSendPayload,
  fromAddress: string = EMAIL_FROM,
): Promise<Record<string, unknown>> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resendPayload = {
    from: fromAddress,
    to: [payload.hr_email],
    cc: payload.cc_emails,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  };

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendPayload),
  });

  const resendBody = await resendResponse.text();

  if (!resendResponse.ok) {
    throw new Error(`Resend error ${resendResponse.status}: ${resendBody}`);
  }

  let resendJson: Record<string, unknown> = {};
  try {
    resendJson = JSON.parse(resendBody) as Record<string, unknown>;
  } catch {
    resendJson = { raw: resendBody };
  }

  return {
    provider: "resend",
    from: fromAddress,
    response: resendJson,
  };
}

function isDomainNotVerifiedError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("domain is not verified") ||
    (normalized.includes("verify") && normalized.includes("domain"))
  );
}

async function resolveActorEmail(
  supabase: ReturnType<typeof createClient>,
  actorUserId: string | null | undefined,
): Promise<string | null> {
  if (!actorUserId) {
    return null;
  }

  const { data, error } = await supabase.auth.admin.getUserById(actorUserId);
  if (error) {
    return null;
  }

  const actorEmail = data?.user?.email;
  return isValidEmail(actorEmail) ? actorEmail.trim() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Supabase environment variables are missing" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let payload: SendSwapHREmailPayload;
  try {
    payload = (await req.json()) as SendSwapHREmailPayload;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (
    !payload.request_id ||
    !payload.actor_user_id ||
    !payload.hr_email ||
    !payload.approve_url ||
    !payload.decline_url ||
    !payload.expires_at
  ) {
    return json(400, {
      error:
        "Missing required fields: request_id, actor_user_id, hr_email, approve_url, decline_url, expires_at",
    });
  }

  const actorEmail = await resolveActorEmail(supabase, payload.actor_user_id);
  if (!actorEmail) {
    return json(400, {
      error: "Unable to resolve the sender user email for mandatory CC.",
    });
  }

  const ccEmails = buildHrCcList({
    configuredCcEmails: Array.isArray(payload.cc_emails)
      ? payload.cc_emails
      : [],
    actorEmail,
  });

  const { data: requestRow, error: requestError } = await supabase
    .from("swap_requests")
    .select(
      "id, requester_user_id, target_user_id, requester_shift_id, target_shift_id, created_at, rule_violation, violation_reason",
    )
    .eq("id", payload.request_id)
    .single();

  if (requestError || !requestRow) {
    return json(404, { error: "Swap request not found" });
  }

  const [
    requesterUserResult,
    targetUserResult,
    requesterShiftResult,
    targetShiftResult,
  ] = await Promise.allSettled([
    supabase
      .from("users")
      .select("id, full_name, email, employee_code")
      .eq("id", requestRow.requester_user_id)
      .single(),
    supabase
      .from("users")
      .select("id, full_name, email, employee_code")
      .eq("id", requestRow.target_user_id)
      .single(),
    supabase
      .from("shifts")
      .select("id, date, starts_at, ends_at")
      .eq("id", requestRow.requester_shift_id)
      .maybeSingle(),
    requestRow.target_shift_id
      ? supabase
          .from("shifts")
          .select("id, date, starts_at, ends_at")
          .eq("id", requestRow.target_shift_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const requesterUser =
    requesterUserResult.status === "fulfilled" &&
    !requesterUserResult.value.error
      ? requesterUserResult.value.data
      : null;
  const targetUser =
    targetUserResult.status === "fulfilled" && !targetUserResult.value.error
      ? targetUserResult.value.data
      : null;
  const requesterShift =
    requesterShiftResult.status === "fulfilled" &&
    !requesterShiftResult.value.error
      ? requesterShiftResult.value.data
      : null;
  const targetShift =
    targetShiftResult.status === "fulfilled" && !targetShiftResult.value.error
      ? targetShiftResult.value.data
      : null;

  const requesterName =
    requesterUser?.full_name ??
    requesterUser?.email ??
    String(requestRow.requester_user_id).slice(0, 8);
  const targetName =
    targetUser?.full_name ??
    targetUser?.email ??
    String(requestRow.target_user_id).slice(0, 8);
  const requesterCode = requesterUser?.employee_code ?? "N/D";
  const targetCode = targetUser?.employee_code ?? "N/D";

  const context: SwapEmailContext = {
    requestId: payload.request_id,
    createdAt:
      typeof requestRow.created_at === "string" ? requestRow.created_at : null,
    expiresAt: payload.expires_at,
    requesterName,
    requesterCode,
    targetName,
    targetCode,
    requesterShiftLabel: formatShiftLabel(
      requesterShift as Record<string, unknown> | null,
    ),
    targetShiftLabel: formatShiftLabel(
      targetShift as Record<string, unknown> | null,
    ),
    violationLabel:
      typeof requestRow.rule_violation === "string"
        ? requestRow.rule_violation
        : null,
    violationReason:
      typeof requestRow.violation_reason === "string"
        ? requestRow.violation_reason
        : null,
    approveUrl: payload.approve_url,
    declineUrl: payload.decline_url,
  };

  const subject = `Ação RH: decisão de troca ${requesterName} ↔ ${targetName}`;
  const text = buildSwapEmailText(context);
  const html = buildSwapEmailHtml(context);

  const sendPayload: ProviderSendPayload = {
    hr_email: payload.hr_email,
    cc_emails: ccEmails,
    subject,
    text,
    html,
  };

  const providerErrors: string[] = [];

  try {
    const resendResult = await sendViaResend(sendPayload);
    return json(200, {
      ok: true,
      provider: "resend",
      provider_result: resendResult,
      request_id: payload.request_id,
    });
  } catch (error) {
    const resendErrorMessage =
      error instanceof Error ? error.message : String(error);
    providerErrors.push(`resend: ${resendErrorMessage}`);

    if (isDomainNotVerifiedError(resendErrorMessage)) {
      if (actorEmail) {
        try {
          const resendFallbackResult = await sendViaResend(
            sendPayload,
            actorEmail,
          );
          return json(200, {
            ok: true,
            provider: "resend",
            sender_mode: "actor_email_fallback",
            provider_result: resendFallbackResult,
            request_id: payload.request_id,
          });
        } catch (fallbackError) {
          providerErrors.push(
            `resend-actor-fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          );
        }
      } else {
        providerErrors.push(
          "resend-actor-fallback: Logged-in user email is unavailable",
        );
      }
    }
  }

  return json(502, {
    error: "Failed to send HR email using Resend",
    details: providerErrors,
    request_id: payload.request_id,
  });
});
