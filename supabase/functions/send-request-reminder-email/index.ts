import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { isValidEmail } from "../_shared/hr-email-policy.ts";
import {
  buildLeaveReminderTemplate,
  buildSwapReminderTemplate,
} from "../_shared/request-reminder-template.ts";

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

type RequestType = "swap_request" | "leave_request";

type ReminderReason =
  | "request_created"
  | "awaiting_peer_decision"
  | "submitted_to_hr"
  | "awaiting_hr_decision"
  | "status_update";

interface SendRequestReminderPayload {
  request_type: RequestType;
  request_id: string;
  recipient_user_id: string;
  reason: ReminderReason;
  actor_user_id?: string | null;
}

interface ProviderSendPayload {
  to_email: string;
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

function formatDateTimePt(value: string | null | undefined): string {
  if (!value) return "N/D";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "N/D";
  return dt.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShiftLabel(shift: Record<string, unknown> | null): string {
  if (!shift) return "Turno indisponível";

  const date =
    typeof shift.date === "string"
      ? new Date(`${shift.date}T00:00:00`)
      : new Date(NaN);
  const startsAt =
    typeof shift.starts_at === "string" ? new Date(shift.starts_at) : null;
  const endsAt = typeof shift.ends_at === "string" ? new Date(shift.ends_at) : null;

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

async function resolveUserProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ name: string; code: string; email: string | null }> {
  const { data } = await supabase
    .from("users")
    .select("full_name, employee_code, email")
    .eq("id", userId)
    .maybeSingle();

  const tableEmail = typeof data?.email === "string" ? data.email.trim() : null;
  if (isValidEmail(tableEmail)) {
    return {
      name:
        (typeof data?.full_name === "string" && data.full_name.trim()) ||
        tableEmail ||
        userId.slice(0, 8),
      code:
        (typeof data?.employee_code === "string" && data.employee_code.trim()) ||
        "N/D",
      email: tableEmail,
    };
  }

  const authResult = await supabase.auth.admin.getUserById(userId);
  const authEmail = authResult.data?.user?.email?.trim() ?? null;

  return {
    name:
      (typeof data?.full_name === "string" && data.full_name.trim()) ||
      authEmail ||
      userId.slice(0, 8),
    code:
      (typeof data?.employee_code === "string" && data.employee_code.trim()) ||
      "N/D",
    email: isValidEmail(authEmail) ? authEmail : null,
  };
}

async function sendViaResend(payload: ProviderSendPayload): Promise<Record<string, unknown>> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [payload.to_email],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Resend error ${response.status}: ${raw}`);
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

async function buildSwapReminder(
  supabase: ReturnType<typeof createClient>,
  payload: SendRequestReminderPayload,
): Promise<ProviderSendPayload> {
  const { data: requestRow, error } = await supabase
    .from("swap_requests")
    .select(
      "id, requester_user_id, target_user_id, requester_shift_id, target_shift_id, status, created_at, updated_at",
    )
    .eq("id", payload.request_id)
    .single();

  if (error || !requestRow) {
    throw new Error("Swap request not found");
  }

  const [recipientProfile, requesterProfile, targetProfile, requesterShiftRes, targetShiftRes] =
    await Promise.all([
      resolveUserProfile(supabase, payload.recipient_user_id),
      resolveUserProfile(supabase, String(requestRow.requester_user_id)),
      resolveUserProfile(supabase, String(requestRow.target_user_id)),
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

  if (!recipientProfile.email) {
    throw new Error("Recipient email is unavailable");
  }

  const requesterShiftLabel = formatShiftLabel(
    requesterShiftRes.data as Record<string, unknown> | null,
  );
  const targetShiftLabel = formatShiftLabel(
    targetShiftRes.data as Record<string, unknown> | null,
  );
  const template = buildSwapReminderTemplate({
    recipientName: recipientProfile.name,
    reason: payload.reason,
    requestId: String(requestRow.id),
    status: String(requestRow.status),
    requesterName: requesterProfile.name,
    requesterCode: requesterProfile.code,
    targetName: targetProfile.name,
    targetCode: targetProfile.code,
    requesterShiftLabel,
    targetShiftLabel,
    createdAt: formatDateTimePt(String(requestRow.created_at)),
    updatedAt: formatDateTimePt(String(requestRow.updated_at)),
  });

  return {
    to_email: recipientProfile.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  };
}

async function buildLeaveReminder(
  supabase: ReturnType<typeof createClient>,
  payload: SendRequestReminderPayload,
): Promise<ProviderSendPayload> {
  const { data: leaveRow, error } = await supabase
    .from("leave_requests")
    .select(
      "id, user_id, type, requested_start_date, requested_end_date, status, created_at, updated_at",
    )
    .eq("id", payload.request_id)
    .single();

  if (error || !leaveRow) {
    throw new Error("Leave request not found");
  }

  const [recipientProfile, ownerProfile] = await Promise.all([
    resolveUserProfile(supabase, payload.recipient_user_id),
    resolveUserProfile(supabase, String(leaveRow.user_id)),
  ]);

  if (!recipientProfile.email) {
    throw new Error("Recipient email is unavailable");
  }

  const template = buildLeaveReminderTemplate({
    recipientName: recipientProfile.name,
    reason: payload.reason,
    requestId: String(leaveRow.id),
    status: String(leaveRow.status),
    ownerName: ownerProfile.name,
    ownerCode: ownerProfile.code,
    leaveType: String(leaveRow.type),
    leavePeriod: `${String(leaveRow.requested_start_date)} até ${String(
      leaveRow.requested_end_date,
    )}`,
    createdAt: formatDateTimePt(String(leaveRow.created_at)),
    updatedAt: formatDateTimePt(String(leaveRow.updated_at)),
  });

  return {
    to_email: recipientProfile.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
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

  let payload: SendRequestReminderPayload;
  try {
    payload = (await req.json()) as SendRequestReminderPayload;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (
    !payload.request_type ||
    !payload.request_id ||
    !payload.recipient_user_id ||
    !payload.reason
  ) {
    return json(400, {
      error:
        "Missing required fields: request_type, request_id, recipient_user_id, reason",
    });
  }

  try {
    const providerPayload =
      payload.request_type === "swap_request"
        ? await buildSwapReminder(supabase, payload)
        : await buildLeaveReminder(supabase, payload);

    const result = await sendViaResend(providerPayload);

    return json(200, {
      ok: true,
      provider: "resend",
      request_type: payload.request_type,
      request_id: payload.request_id,
      recipient_user_id: payload.recipient_user_id,
      provider_result: result,
    });
  } catch (error) {
    return json(502, {
      error: "Failed to send request reminder email",
      details: error instanceof Error ? error.message : String(error),
      request_type: payload.request_type,
      request_id: payload.request_id,
      recipient_user_id: payload.recipient_user_id,
    });
  }
});
