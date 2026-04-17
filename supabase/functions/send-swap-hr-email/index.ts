import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") ?? "ShiftSync <no-reply@shiftsync.app>";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number.parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
const SMTP_USERNAME = Deno.env.get("SMTP_USERNAME") ?? "";
const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD") ?? "";
const SMTP_SECURE =
  (Deno.env.get("SMTP_SECURE") ?? "false").toLowerCase() === "true";
const SMTP_FROM = Deno.env.get("SMTP_FROM") ?? EMAIL_FROM;

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

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function hasSmtpConfig(): boolean {
  return (
    Boolean(SMTP_HOST) &&
    Number.isFinite(SMTP_PORT) &&
    SMTP_PORT > 0 &&
    Boolean(SMTP_USERNAME) &&
    Boolean(SMTP_PASSWORD)
  );
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

function isValidEmail(email: string | null | undefined): email is string {
  if (typeof email !== "string") return false;
  const normalized = email.trim();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
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

async function sendViaSmtp(
  payload: ProviderSendPayload,
): Promise<Record<string, unknown>> {
  if (!hasSmtpConfig()) {
    throw new Error(
      "SMTP fallback is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD",
    );
  }

  const nodemailer = await import("npm:nodemailer@6.10.0");

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USERNAME,
      pass: SMTP_PASSWORD,
    },
  });

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: payload.hr_email,
    cc: payload.cc_emails.length > 0 ? payload.cc_emails : undefined,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  return {
    provider: "smtp",
    messageId: typeof info?.messageId === "string" ? info.messageId : null,
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

  let payload: SendSwapHREmailPayload;
  try {
    payload = (await req.json()) as SendSwapHREmailPayload;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (
    !payload.request_id ||
    !payload.hr_email ||
    !payload.approve_url ||
    !payload.decline_url ||
    !payload.expires_at
  ) {
    return json(400, {
      error:
        "Missing required fields: request_id, hr_email, approve_url, decline_url, expires_at",
    });
  }

  const { data: requestRow, error: requestError } = await supabase
    .from("swap_requests")
    .select("id, requester_user_id, target_user_id")
    .eq("id", payload.request_id)
    .single();

  if (requestError || !requestRow) {
    return json(404, { error: "Swap request not found" });
  }

  const subject = "Pedido de decisão RH para troca de turno";

  const text = [
    "Olá RH,",
    "",
    "Existe um pedido de troca de turno pendente de decisão.",
    "",
    `ID do pedido: ${payload.request_id}`,
    `Expira em: ${new Date(payload.expires_at).toLocaleString("pt-PT")}`,
    "",
    `Aprovar: ${payload.approve_url}`,
    `Rejeitar: ${payload.decline_url}`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">Pedido de decisão RH</h2>
      <p style="margin: 0 0 8px;">Existe um pedido de troca de turno pendente de decisão.</p>
      <p style="margin: 0 0 16px;"><strong>ID do pedido:</strong> ${payload.request_id}<br/><strong>Expira em:</strong> ${new Date(payload.expires_at).toLocaleString("pt-PT")}</p>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <a href="${payload.approve_url}" style="background:#16a34a;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">Aprovar</a>
        <a href="${payload.decline_url}" style="background:#dc2626;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">Rejeitar</a>
      </div>
    </div>
  `;

  const sendPayload: ProviderSendPayload = {
    hr_email: payload.hr_email,
    cc_emails: Array.isArray(payload.cc_emails) ? payload.cc_emails : [],
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
      const actorEmail = await resolveActorEmail(
        supabase,
        payload.actor_user_id,
      );
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

  try {
    const smtpResult = await sendViaSmtp(sendPayload);
    return json(200, {
      ok: true,
      provider: "smtp",
      provider_result: smtpResult,
      request_id: payload.request_id,
    });
  } catch (error) {
    providerErrors.push(
      `smtp: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return json(502, {
    error: "Failed to send HR email using all configured providers",
    details: providerErrors,
    request_id: payload.request_id,
  });
});
