import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { buildHrCcList, isValidEmail } from "../_shared/hr-email-policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") ?? "ShiftSync <no-reply@shiftsync.app>";
const LEAVE_ATTACHMENTS_BUCKET = "leave-attachments";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LeaveEmailAttachmentPayload {
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  storagePath: string;
}

interface SendLeaveHREmailPayload {
  leave_request_id: string;
  actor_user_id?: string | null;
  hr_email: string;
  cc_emails?: string[];
  subject: string;
  body: string;
  attachments?: LeaveEmailAttachmentPayload[];
}

interface ProviderAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

interface ProviderSendPayload {
  hr_email: string;
  cc_emails: string[];
  subject: string;
  text: string;
  html: string;
  attachments: ProviderAttachment[];
}

interface LeaveEmailContext {
  requesterName: string;
  requesterCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
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

function toHtmlBody(input: {
  subject: string;
  body: string;
  leaveRequestId: string;
  attachmentsCount: number;
  context: LeaveEmailContext | null;
}): string {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(
      (chunk) =>
        `<p style="margin:0 0 12px;line-height:1.6;color:#1e293b;">${escapeHtml(chunk).replaceAll("\n", "<br/>")}</p>`,
    )
    .join("");

  const attachmentsBadge =
    input.attachmentsCount > 0
      ? `<div style="display:inline-block;margin-top:12px;padding:6px 10px;border-radius:999px;background:#ecfeff;color:#0e7490;font-size:12px;font-weight:700;">Anexos: ${input.attachmentsCount}</div>`
      : "";

  return `
    <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;background:linear-gradient(120deg,#0f766e,#115e59);color:#f0fdfa;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:.9;">ShiftSync RH</div>
            <h2 style="margin:8px 0 0;font-size:22px;line-height:1.2;">Pedido de ausência para decisão</h2>
            <p style="margin:10px 0 0;font-size:14px;opacity:.95;">Resumo pronto para análise e aprovação.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;">
            <div style="padding:12px 14px;border-radius:12px;border:1px solid #dbeafe;background:#eff6ff;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#1d4ed8;">Assunto</div>
              <div style="margin-top:4px;font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(input.subject)}</div>
              <div style="margin-top:8px;font-size:12px;color:#334155;">Pedido: ${escapeHtml(input.leaveRequestId)}</div>
              ${attachmentsBadge}
            </div>

            ${
              input.context
                ? `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;">
                    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;">Alteração solicitada (por quem e para quê)</div>
                    <div style="margin-top:8px;font-size:14px;"><strong>Pedido por:</strong> ${escapeHtml(input.context.requesterName)} (${escapeHtml(input.context.requesterCode)})</div>
                    <div style="margin-top:4px;font-size:14px;"><strong>Tipo:</strong> ${escapeHtml(input.context.leaveType)}</div>
                    <div style="margin-top:4px;font-size:14px;"><strong>Período:</strong> ${escapeHtml(`${input.context.startDate} até ${input.context.endDate}`)}</div>
                    <div style="margin-top:4px;font-size:14px;"><strong>Estado:</strong> ${escapeHtml(input.context.status)}</div>
                  </div>`
                : ""
            }

            <div style="margin-top:16px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
              ${paragraphs || '<p style="margin:0;color:#64748b;">Sem detalhes adicionais.</p>'}
            </div>

            <p style="margin:16px 0 0;font-size:12px;color:#64748b;">Decida no sistema ShiftSync usando os links seguros recebidos neste mesmo pedido.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function loadProviderAttachments(
  supabase: ReturnType<typeof createClient>,
  attachments: LeaveEmailAttachmentPayload[],
): Promise<ProviderAttachment[]> {
  const loaded: ProviderAttachment[] = [];

  for (const attachment of attachments) {
    const { data, error } = await supabase.storage
      .from(LEAVE_ATTACHMENTS_BUCKET)
      .download(attachment.storagePath);

    if (error || !data) {
      throw new Error(
        `Falha ao carregar o anexo ${attachment.fileName}: ${error?.message ?? "ficheiro indisponível"}`,
      );
    }

    loaded.push({
      filename: attachment.fileName,
      content: arrayBufferToBase64(await data.arrayBuffer()),
      contentType: attachment.fileType ?? undefined,
    });
  }

  return loaded;
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
    attachments: payload.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
    })),
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

async function loadLeaveEmailContext(
  supabase: ReturnType<typeof createClient>,
  leaveRequestId: string,
): Promise<LeaveEmailContext | null> {
  const { data: leaveRow, error } = await supabase
    .from("leave_requests")
    .select(
      "id, user_id, type, requested_start_date, requested_end_date, status",
    )
    .eq("id", leaveRequestId)
    .maybeSingle();

  if (error || !leaveRow) {
    return null;
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("full_name, employee_code, email")
    .eq("id", leaveRow.user_id)
    .maybeSingle();

  const name =
    (typeof userRow?.full_name === "string" && userRow.full_name.trim()) ||
    (typeof userRow?.email === "string" && userRow.email.trim()) ||
    String(leaveRow.user_id).slice(0, 8);
  const code =
    (typeof userRow?.employee_code === "string" &&
      userRow.employee_code.trim()) ||
    "N/D";

  return {
    requesterName: name,
    requesterCode: code,
    leaveType: String(leaveRow.type),
    startDate: String(leaveRow.requested_start_date),
    endDate: String(leaveRow.requested_end_date),
    status: String(leaveRow.status),
  };
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

  let payload: SendLeaveHREmailPayload;
  try {
    payload = (await req.json()) as SendLeaveHREmailPayload;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (
    !payload.leave_request_id ||
    !payload.actor_user_id ||
    !payload.hr_email ||
    !payload.subject ||
    !payload.body
  ) {
    return json(400, {
      error:
        "Missing required fields: leave_request_id, actor_user_id, hr_email, subject, body",
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

  const leaveContext = await loadLeaveEmailContext(
    supabase,
    payload.leave_request_id,
  );

  const providerPayload: ProviderSendPayload = {
    hr_email: payload.hr_email,
    cc_emails: ccEmails,
    subject: payload.subject,
    text: payload.body,
    html: toHtmlBody({
      subject: payload.subject,
      body: payload.body,
      leaveRequestId: payload.leave_request_id,
      attachmentsCount: Array.isArray(payload.attachments)
        ? payload.attachments.length
        : 0,
      context: leaveContext,
    }),
    attachments: await loadProviderAttachments(
      supabase,
      Array.isArray(payload.attachments) ? payload.attachments : [],
    ),
  };

  const providerErrors: string[] = [];
  const nowIso = new Date().toISOString();

  try {
    const resendResult = await sendViaResend(providerPayload);

    await (supabase as any).from("email_deliveries").insert({
      workflow_type: "leave_request",
      target_id: payload.leave_request_id,
      to_email: payload.hr_email,
      cc_emails: providerPayload.cc_emails,
      status: "sent",
      sent_at: nowIso,
      error_message: null,
      metadata: {
        provider: "resend",
        subject: payload.subject,
        body: payload.body,
        attachments: payload.attachments ?? [],
        provider_result: resendResult,
      },
      created_at: nowIso,
    });

    return json(200, {
      ok: true,
      provider: "resend",
      provider_result: resendResult,
      leave_request_id: payload.leave_request_id,
    });
  } catch (error) {
    const resendErrorMessage =
      error instanceof Error ? error.message : String(error);
    providerErrors.push(`resend: ${resendErrorMessage}`);

    if (isDomainNotVerifiedError(resendErrorMessage)) {
      if (actorEmail) {
        try {
          const resendFallbackResult = await sendViaResend(
            providerPayload,
            actorEmail,
          );

          await (supabase as any).from("email_deliveries").insert({
            workflow_type: "leave_request",
            target_id: payload.leave_request_id,
            to_email: payload.hr_email,
            cc_emails: providerPayload.cc_emails,
            status: "sent",
            sent_at: nowIso,
            error_message: null,
            metadata: {
              provider: "resend",
              sender_mode: "actor_email_fallback",
              subject: payload.subject,
              body: payload.body,
              attachments: payload.attachments ?? [],
              provider_result: resendFallbackResult,
            },
            created_at: nowIso,
          });

          return json(200, {
            ok: true,
            provider: "resend",
            sender_mode: "actor_email_fallback",
            provider_result: resendFallbackResult,
            leave_request_id: payload.leave_request_id,
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

  await (supabase as any).from("email_deliveries").insert({
    workflow_type: "leave_request",
    target_id: payload.leave_request_id,
    to_email: payload.hr_email,
    cc_emails: providerPayload.cc_emails,
    status: "failed",
    sent_at: null,
    error_message: providerErrors.join(" | "),
    metadata: {
      subject: payload.subject,
      body: payload.body,
      attachments: payload.attachments ?? [],
      details: providerErrors,
    },
    created_at: nowIso,
  });

  return json(502, {
    error: "Failed to send leave HR email using Resend",
    details: providerErrors,
    leave_request_id: payload.leave_request_id,
  });
});
