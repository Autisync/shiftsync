import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CALENDAR_SYNC_ENDPOINT = Deno.env.get("CALENDAR_SYNC_ENDPOINT") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ProcessSharedScheduleRequest {
  shared_upload_id: string;
  receiver_user_id: string;
}

interface RecoveryShift {
  employee_id?: string;
  employee_name?: string;
  date: string;
  starts_at: string;
  ends_at: string;
  role?: string;
  location?: string;
}

interface ProcessResponse {
  success: boolean;
  shifts_inserted: number;
  consent_violations: number;
  message: string;
  calendar_sync_triggered?: boolean;
}

function normalizeEmployeeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

async function verifyConsent(
  uploadId: string,
  receiverUserId: string,
): Promise<{ valid: boolean; reason?: string }> {
  const { data: upload, error: uploadError } = await supabase
    .from("schedule_uploads")
    .select("id, uploader_user_id, consent_to_share")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload) {
    return { valid: false, reason: "Upload not found" };
  }

  if (!upload.consent_to_share) {
    return { valid: false, reason: "Uploader has not consented to share" };
  }

  if (upload.uploader_user_id === receiverUserId) {
    return { valid: false, reason: "Cannot process shared schedule for uploader itself" };
  }

  const { data: accessRequest, error: accessError } = await supabase
    .from("schedule_access_requests")
    .select("id, consent_given, status")
    .eq("schedule_upload_id", uploadId)
    .eq("requester_user_id", receiverUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError) {
    return { valid: false, reason: `Failed to verify receiver consent: ${accessError.message}` };
  }

  if (!accessRequest) {
    return { valid: false, reason: "Receiver consent/request not found" };
  }

  if (!accessRequest.consent_given || accessRequest.status !== "approved") {
    return { valid: false, reason: "Receiver consent not approved" };
  }

  return { valid: true };
}

async function extractRelevantShifts(
  uploadId: string,
  receiverUserId: string,
): Promise<{ shifts: RecoveryShift[]; error?: string }> {
  const { data: upload, error: uploadError } = await supabase
    .from("schedule_uploads")
    .select("metadata")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload) {
    return { shifts: [], error: "Upload metadata not found" };
  }

  const { data: receiver, error: receiverError } = await supabase
    .from("users")
    .select("id, employee_code, full_name")
    .eq("id", receiverUserId)
    .single();

  if (receiverError || !receiver) {
    return { shifts: [], error: "Receiver not found" };
  }

  const payload = upload.metadata?.parsed_payload;
  if (!Array.isArray(payload)) {
    return { shifts: [], error: "No parsed payload available in upload metadata" };
  }

  const receiverCode = normalizeEmployeeName(receiver.employee_code || "");
  const receiverName = normalizeEmployeeName(receiver.full_name || "");

  const relevant = (payload as RecoveryShift[]).filter((shift) => {
    const shiftCode = normalizeEmployeeName(shift.employee_id || "");
    const shiftName = normalizeEmployeeName(shift.employee_name || "");

    return (receiverCode && shiftCode === receiverCode) ||
      (receiverName && shiftName === receiverName);
  });

  return { shifts: relevant };
}

async function insertShiftsForReceiver(
  shifts: RecoveryShift[],
  receiverUserId: string,
  uploadId: string,
): Promise<{ inserted: number; duplicates: number; errors: string[] }> {
  const errors: string[] = [];

  if (shifts.length === 0) {
    return { inserted: 0, duplicates: 0, errors: ["No relevant shifts found for receiver"] };
  }

  const rows = shifts.map((shift) => ({
    user_id: receiverUserId,
    date: shift.date,
    starts_at: shift.starts_at,
    ends_at: shift.ends_at,
    role: shift.role,
    location: shift.location,
    source_upload_id: uploadId,
  }));

  const { data, error } = await supabase
    .from("shifts")
    .upsert(rows, {
      onConflict: "user_id,starts_at,ends_at",
      ignoreDuplicates: true,
    })
    .select("id", { count: "exact" });

  if (error) {
    errors.push(error.message);
    return { inserted: 0, duplicates: 0, errors };
  }

  const inserted = data?.length || 0;
  const duplicates = rows.length - inserted;

  return { inserted, duplicates, errors };
}

async function triggerCalendarSync(receiverUserId: string): Promise<boolean> {
  if (!CALENDAR_SYNC_ENDPOINT) {
    return false;
  }

  try {
    const response = await fetch(CALENDAR_SYNC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: receiverUserId,
        reason: "shared_schedule_recovery",
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: ProcessSharedScheduleRequest = await req.json();

    if (!body.shared_upload_id || !body.receiver_user_id) {
      return new Response(
        JSON.stringify({
          success: false,
          shifts_inserted: 0,
          consent_violations: 0,
          message: "Missing required fields: shared_upload_id, receiver_user_id",
        } as ProcessResponse),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const consentCheck = await verifyConsent(body.shared_upload_id, body.receiver_user_id);
    if (!consentCheck.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          shifts_inserted: 0,
          consent_violations: 1,
          message: `Consent check failed: ${consentCheck.reason}`,
        } as ProcessResponse),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { shifts, error: extractError } = await extractRelevantShifts(
      body.shared_upload_id,
      body.receiver_user_id,
    );

    if (extractError) {
      return new Response(
        JSON.stringify({
          success: false,
          shifts_inserted: 0,
          consent_violations: 0,
          message: `Failed to extract shifts: ${extractError}`,
        } as ProcessResponse),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { inserted, duplicates, errors } = await insertShiftsForReceiver(
      shifts,
      body.receiver_user_id,
      body.shared_upload_id,
    );

    const calendarSyncTriggered = await triggerCalendarSync(body.receiver_user_id);

    return new Response(
      JSON.stringify({
        success: inserted > 0,
        shifts_inserted: inserted,
        consent_violations: 0,
        calendar_sync_triggered: calendarSyncTriggered,
        message:
          inserted > 0
            ? `Inserted ${inserted} shifts for receiver (duplicates skipped: ${duplicates}).`
            : `No shifts inserted. ${errors.join("; ")}`,
      } as ProcessResponse),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        shifts_inserted: 0,
        consent_violations: 1,
        message: `Internal server error: ${error.message}`,
      } as ProcessResponse),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
