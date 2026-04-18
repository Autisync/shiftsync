import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LEAVE_HR_ACTION_SECRET =
  Deno.env.get("LEAVE_HR_ACTION_SECRET") ??
  Deno.env.get("SWAP_HR_ACTION_SECRET") ??
  "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type HrAction = "approve" | "decline" | "adjust";

interface SignedActionPayload {
  lid: string;
  act: HrAction;
  exp: string;
  n: string;
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function signText(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return toBase64Url(new Uint8Array(signature));
}

async function verifyTextSignature(
  secret: string,
  input: string,
  signature: string,
): Promise<boolean> {
  const expected = await signText(secret, input);
  return expected === signature;
}

function createNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function createSignedToken(
  leaveRequestId: string,
  action: HrAction,
  expiresAt: string,
): Promise<string> {
  const payload: SignedActionPayload = {
    lid: leaveRequestId,
    act: action,
    exp: expiresAt,
    n: createNonce(),
  };
  const payloadJson = JSON.stringify(payload);
  const payloadPart = toBase64Url(new TextEncoder().encode(payloadJson));
  const signaturePart = await signText(LEAVE_HR_ACTION_SECRET, payloadPart);
  return `${payloadPart}.${signaturePart}`;
}

async function parseAndVerifySignedToken(
  token: string,
): Promise<SignedActionPayload> {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    throw new Error("invalid_token_format");
  }

  const validSignature = await verifyTextSignature(
    LEAVE_HR_ACTION_SECRET,
    payloadPart,
    signaturePart,
  );

  if (!validSignature) {
    throw new Error("invalid_signature");
  }

  const payloadBytes = fromBase64Url(payloadPart);
  const payload = JSON.parse(
    new TextDecoder().decode(payloadBytes),
  ) as SignedActionPayload;

  if (!payload?.lid || !payload?.act || !payload?.exp || !payload?.n) {
    throw new Error("invalid_payload");
  }

  if (
    payload.act !== "approve" &&
    payload.act !== "decline" &&
    payload.act !== "adjust"
  ) {
    throw new Error("invalid_action");
  }

  if (Number.isNaN(new Date(payload.exp).getTime())) {
    throw new Error("invalid_expiry");
  }

  return payload;
}

function getBaseUrl(input: unknown): string {
  const fallback = "http://localhost:5173/";
  if (typeof input !== "string" || !input.trim()) {
    return fallback;
  }

  try {
    const base = new URL(input);
    return base.toString();
  } catch {
    return fallback;
  }
}

function buildActionUrl(
  baseUrl: string,
  token: string,
  action: HrAction,
): string {
  const url = new URL("home/leave/action", baseUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("action", action);
  return url.toString();
}

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
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

  if (!LEAVE_HR_ACTION_SECRET) {
    return json(500, {
      error: "LEAVE_HR_ACTION_SECRET is not configured",
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const operation = body.operation;
  if (operation !== "create" && operation !== "consume") {
    return json(400, { error: "Invalid operation. Use create or consume." });
  }

  if (operation === "create") {
    const jwt = getBearerToken(req);
    let callerUserId: string | null = null;
    if (jwt) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(jwt);

      // If a bearer token is provided, validate it; if it is invalid, continue
      // in compatibility mode instead of failing with 401.
      if (!userError && user) {
        callerUserId = user.id;
      }
    }

    const leaveRequestId =
      typeof body.leave_request_id === "string" ? body.leave_request_id : "";
    if (!leaveRequestId) {
      return json(400, { error: "leave_request_id is required" });
    }

    const { data: leaveRow, error: leaveError } = await supabase
      .from("leave_requests")
      .select("id, user_id, status")
      .eq("id", leaveRequestId)
      .single();

    if (leaveError || !leaveRow) {
      return json(404, { error: "Leave request not found" });
    }

    if (callerUserId && leaveRow.user_id !== callerUserId) {
      return json(403, {
        error: "Only request owner can generate leave decision links",
      });
    }

    if (leaveRow.status !== "draft" && leaveRow.status !== "pending") {
      return json(409, {
        error: "Leave request must be draft/pending before generating links",
        status: leaveRow.status,
      });
    }

    const expiresInHoursRaw =
      typeof body.expires_in_hours === "number" ? body.expires_in_hours : 72;
    const expiresInHours = Math.min(
      168,
      Math.max(1, Math.floor(expiresInHoursRaw)),
    );
    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000,
    ).toISOString();

    const approveToken = await createSignedToken(
      leaveRequestId,
      "approve",
      expiresAt,
    );
    const declineToken = await createSignedToken(
      leaveRequestId,
      "decline",
      expiresAt,
    );
    const adjustToken = await createSignedToken(
      leaveRequestId,
      "adjust",
      expiresAt,
    );

    await (supabase as any)
      .from("action_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        consumed_by: "rotated",
      })
      .eq("workflow_type", "leave_hr_decision")
      .eq("target_id", leaveRequestId)
      .is("consumed_at", null);

    const rows = [
      {
        entity_type: "leave_request",
        entity_id: leaveRequestId,
        workflow_type: "leave_hr_decision",
        target_id: leaveRequestId,
        token: approveToken,
        action: "approve",
        expires_at: expiresAt,
        created_by: callerUserId,
      },
      {
        entity_type: "leave_request",
        entity_id: leaveRequestId,
        workflow_type: "leave_hr_decision",
        target_id: leaveRequestId,
        token: declineToken,
        action: "decline",
        expires_at: expiresAt,
        created_by: callerUserId,
      },
      {
        entity_type: "leave_request",
        entity_id: leaveRequestId,
        workflow_type: "leave_hr_decision",
        target_id: leaveRequestId,
        token: adjustToken,
        action: "adjust",
        expires_at: expiresAt,
        created_by: callerUserId,
      },
    ];

    const { error: insertError } = await (supabase as any)
      .from("action_tokens")
      .insert(rows);

    if (insertError) {
      return json(500, {
        error: "Failed to create action tokens",
        details: insertError.message,
      });
    }

    const baseUrl = getBaseUrl(body.base_url);

    return json(200, {
      ok: true,
      leave_request_id: leaveRequestId,
      expires_at: expiresAt,
      approve_url: buildActionUrl(baseUrl, approveToken, "approve"),
      decline_url: buildActionUrl(baseUrl, declineToken, "decline"),
      adjust_url: buildActionUrl(baseUrl, adjustToken, "adjust"),
    });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const action =
    body.action === "approve" ||
    body.action === "decline" ||
    body.action === "adjust"
      ? body.action
      : null;
  const actorEmail =
    typeof body.actor_email === "string" ? body.actor_email : null;

  if (!token || !action) {
    return json(400, { error: "token and action are required" });
  }

  let payload: SignedActionPayload;
  try {
    payload = await parseAndVerifySignedToken(token);
  } catch {
    return json(400, { error: "Invalid or tampered token" });
  }

  if (payload.act !== action) {
    return json(400, { error: "Token action mismatch" });
  }

  if (new Date(payload.exp).getTime() < Date.now()) {
    return json(410, { error: "This decision link has expired" });
  }

  const { data: tokenRow, error: tokenError } = await (supabase as any)
    .from("action_tokens")
    .select("*")
    .eq("token", token)
    .eq("workflow_type", "leave_hr_decision")
    .eq("action", action)
    .maybeSingle();

  if (tokenError) {
    return json(500, {
      error: "Failed to validate action token",
      details: tokenError.message,
    });
  }

  if (!tokenRow) {
    return json(404, { error: "Decision link not found" });
  }

  if (tokenRow.consumed_at) {
    return json(409, { error: "This decision link has already been used" });
  }

  if (new Date(String(tokenRow.expires_at)).getTime() < Date.now()) {
    return json(410, { error: "This decision link has expired" });
  }

  const leaveRequestId = String(tokenRow.target_id);
  if (leaveRequestId !== payload.lid) {
    return json(400, { error: "Token payload does not match persisted token" });
  }

  const { data: leaveRow, error: leaveError } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", leaveRequestId)
    .single();

  if (leaveError || !leaveRow) {
    return json(404, { error: "Leave request not found" });
  }

  if (
    leaveRow.status === "approved" ||
    leaveRow.status === "rejected" ||
    leaveRow.status === "soft_declined"
  ) {
    return json(409, {
      error: "Leave request already decided",
      status: leaveRow.status,
    });
  }

  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    hr_response_notes:
      action === "adjust"
        ? "RH solicitou ajustes ao pedido."
        : (leaveRow.hr_response_notes ?? null),
  };

  if (action === "approve") {
    patch.status = "approved";
    patch.approved_start_date =
      leaveRow.approved_start_date ?? leaveRow.requested_start_date;
    patch.approved_end_date =
      leaveRow.approved_end_date ?? leaveRow.requested_end_date;
  } else if (action === "decline") {
    patch.status = "rejected";
  } else {
    patch.status = "pending";
  }

  const { data: updatedLeave, error: updateError } = await supabase
    .from("leave_requests")
    .update(patch)
    .eq("id", leaveRequestId)
    .select("*")
    .single();

  if (updateError || !updatedLeave) {
    return json(500, {
      error: "Failed to update leave request",
      details: updateError?.message,
    });
  }

  await (supabase as any)
    .from("action_tokens")
    .update({
      consumed_at: nowIso,
      consumed_by: actorEmail,
    })
    .eq("workflow_type", "leave_hr_decision")
    .eq("target_id", leaveRequestId)
    .is("consumed_at", null);

  const title =
    action === "approve"
      ? "Pedido de ausência aprovado"
      : action === "decline"
        ? "Pedido de ausência recusado"
        : "Pedido de ausência requer ajustes";

  const bodyText =
    action === "approve"
      ? "O RH aprovou o pedido de ausência."
      : action === "decline"
        ? "O RH recusou o pedido de ausência."
        : "O RH solicitou ajustes no pedido de ausência.";

  await (supabase as any).from("notifications").insert({
    user_id: leaveRow.user_id,
    type: "leave_request",
    title,
    body: bodyText,
    entity_type: "leave_request",
    entity_id: leaveRequestId,
    created_at: nowIso,
  });

  await (supabase as any).from("email_deliveries").insert({
    entity_type: "leave_request",
    entity_id: leaveRequestId,
    recipient: actorEmail ?? "hr-link-action",
    subject: `HR decision: ${action}`,
    body_preview: bodyText,
    sent_by: null,
    workflow_type: "leave_hr_decision",
    target_id: leaveRequestId,
    to_email: actorEmail,
    cc_emails: [],
    status: "sent",
    error_message: null,
    sent_at: nowIso,
    metadata: {
      source: "leave-hr-actions.consume",
      action,
      token_id: String(tokenRow.id),
      actor_email: actorEmail,
    },
    created_at: nowIso,
  });

  return json(200, {
    ok: true,
    leave_request: updatedLeave,
  });
});
