import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SWAP_HR_ACTION_SECRET = Deno.env.get("SWAP_HR_ACTION_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type HrAction = "approve" | "decline";

interface SignedActionPayload {
  rid: string;
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
  requestId: string,
  action: HrAction,
  expiresAt: string,
): Promise<string> {
  const payload: SignedActionPayload = {
    rid: requestId,
    act: action,
    exp: expiresAt,
    n: createNonce(),
  };
  const payloadJson = JSON.stringify(payload);
  const payloadPart = toBase64Url(new TextEncoder().encode(payloadJson));
  const signaturePart = await signText(SWAP_HR_ACTION_SECRET, payloadPart);
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
    SWAP_HR_ACTION_SECRET,
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

  if (!payload?.rid || !payload?.act || !payload?.exp || !payload?.n) {
    throw new Error("invalid_payload");
  }

  if (payload.act !== "approve" && payload.act !== "decline") {
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
  const url = new URL("home/swaps/action", baseUrl);
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

  if (!SWAP_HR_ACTION_SECRET) {
    return json(500, {
      error: "SWAP_HR_ACTION_SECRET is not configured",
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
    if (!jwt) {
      return json(401, { error: "Missing bearer token" });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return json(401, { error: "Invalid auth token" });
    }

    const requestId =
      typeof body.request_id === "string" ? body.request_id : "";
    if (!requestId) {
      return json(400, { error: "request_id is required" });
    }

    const actorUserId =
      typeof body.actor_user_id === "string" && body.actor_user_id.trim()
        ? body.actor_user_id.trim()
        : user.id;

    if (actorUserId !== user.id) {
      return json(403, {
        error: "actor_user_id must match the authenticated user",
      });
    }

    const expiresInHoursRaw =
      typeof body.expires_in_hours === "number" ? body.expires_in_hours : 24;
    const expiresInHours = Math.min(
      72,
      Math.max(1, Math.floor(expiresInHoursRaw)),
    );
    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000,
    ).toISOString();

    const { data: requestRow, error: requestError } = await supabase
      .from("swap_requests")
      .select("id, requester_user_id, target_user_id, status")
      .eq("id", requestId)
      .single();

    if (requestError || !requestRow) {
      return json(404, { error: "Swap request not found" });
    }

    const isParticipant =
      requestRow.requester_user_id === user.id ||
      requestRow.target_user_id === user.id;

    if (!isParticipant) {
      return json(403, {
        error: "Only swap participants can generate decision links",
      });
    }

    if (
      requestRow.status !== "accepted" &&
      requestRow.status !== "submitted_to_hr"
    ) {
      return json(409, {
        error: "Swap must be accepted before generating HR decision links",
        status: requestRow.status,
      });
    }

    const approveToken = await createSignedToken(
      requestId,
      "approve",
      expiresAt,
    );
    const declineToken = await createSignedToken(
      requestId,
      "decline",
      expiresAt,
    );

    // Invalidate older active links for this request.
    await (supabase as any)
      .from("action_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        consumed_by: "rotated",
      })
      .eq("workflow_type", "swap_hr_decision")
      .eq("target_id", requestId)
      .is("consumed_at", null);

    const rows = [
      {
        entity_type: "swap_request",
        entity_id: requestId,
        workflow_type: "swap_hr_decision",
        target_id: requestId,
        token: approveToken,
        action: "approve",
        expires_at: expiresAt,
        created_by: user.id,
      },
      {
        entity_type: "swap_request",
        entity_id: requestId,
        workflow_type: "swap_hr_decision",
        target_id: requestId,
        token: declineToken,
        action: "decline",
        expires_at: expiresAt,
        created_by: user.id,
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
      request_id: requestId,
      expires_at: expiresAt,
      approve_url: buildActionUrl(baseUrl, approveToken, "approve"),
      decline_url: buildActionUrl(baseUrl, declineToken, "decline"),
    });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const action =
    body.action === "approve" || body.action === "decline" ? body.action : null;
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
    .eq("workflow_type", "swap_hr_decision")
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

  const requestId = String(tokenRow.target_id);
  if (requestId !== payload.rid) {
    return json(400, { error: "Token payload does not match persisted token" });
  }

  const { data: requestRow, error: requestError } = await supabase
    .from("swap_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError || !requestRow) {
    return json(404, { error: "Swap request not found" });
  }

  if (
    requestRow.status === "ready_to_apply" ||
    requestRow.status === "rejected" ||
    requestRow.status === "applied"
  ) {
    return json(409, {
      error: "Swap request already decided",
      status: requestRow.status,
    });
  }

  const nowIso = new Date().toISOString();
  const nextStatus = action === "approve" ? "ready_to_apply" : "rejected";
  const currentHistory = Array.isArray(requestRow.status_history)
    ? requestRow.status_history
    : [];

  const { data: updatedRequest, error: updateError } = await supabase
    .from("swap_requests")
    .update({
      status: nextStatus,
      approved_at: nextStatus === "ready_to_apply" ? nowIso : null,
      rejected_at: nextStatus === "rejected" ? nowIso : null,
      hr_decision_actioned_at: nowIso,
      hr_decision_action: action,
      hr_decision_by: actorEmail,
      status_history: [
        ...currentHistory,
        {
          status: nextStatus,
          changed_at: nowIso,
          changed_by_user_id: null,
        },
      ],
    })
    .eq("id", requestId)
    .select("*")
    .single();

  if (updateError || !updatedRequest) {
    return json(500, {
      error: "Failed to update swap request",
      details: updateError?.message,
    });
  }

  await (supabase as any)
    .from("action_tokens")
    .update({
      consumed_at: nowIso,
      consumed_by: actorEmail,
    })
    .eq("workflow_type", "swap_hr_decision")
    .eq("target_id", requestId)
    .is("consumed_at", null);

  const title =
    nextStatus === "ready_to_apply"
      ? "Troca aprovada pelo RH"
      : "Troca recusada pelo RH";
  const bodyText =
    nextStatus === "ready_to_apply"
      ? "O RH aprovou a troca. Pode avançar para aplicar no calendário."
      : "O RH recusou a troca submetida.";

  await (supabase as any).from("notifications").insert([
    {
      user_id: requestRow.requester_user_id,
      type: "swap_hr_decision",
      title,
      body: bodyText,
      entity_type: "swap_request",
      entity_id: requestId,
      created_at: nowIso,
    },
    {
      user_id: requestRow.target_user_id,
      type: "swap_hr_decision",
      title,
      body: bodyText,
      entity_type: "swap_request",
      entity_id: requestId,
      created_at: nowIso,
    },
  ]);

  // Audit trail: keep a delivery-style log entry for each HR decision click.
  const { error: auditError } = await (supabase as any)
    .from("email_deliveries")
    .insert({
      entity_type: "swap_request",
      entity_id: requestId,
      recipient: actorEmail ?? "hr-link-action",
      subject:
        nextStatus === "ready_to_apply"
          ? "HR decision: approve"
          : "HR decision: decline",
      body_preview:
        nextStatus === "ready_to_apply"
          ? "HR approved swap via secure action link"
          : "HR declined swap via secure action link",
      sent_by: null,
      workflow_type: "swap_hr_decision",
      target_id: requestId,
      to_email: actorEmail,
      cc_emails: [],
      status: "sent",
      error_message: null,
      sent_at: nowIso,
      metadata: {
        source: "swap-hr-actions.consume",
        action,
        next_status: nextStatus,
        token_id: String(tokenRow.id),
        actor_email: actorEmail,
      },
      created_at: nowIso,
    });

  if (auditError) {
    console.warn("[swap-hr-actions] failed to write HR decision audit log", {
      request_id: requestId,
      message: auditError.message,
    });
  }

  return json(200, {
    ok: true,
    request: updatedRequest,
  });
});
