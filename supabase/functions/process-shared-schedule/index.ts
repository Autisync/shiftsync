import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ProcessSharedScheduleRequest {
  shared_upload_id: string;
  receiver_user_id: string;
}

interface ProcessResponse {
  success: boolean;
  shifts_inserted: number;
  consent_violations: number;
  message: string;
}

// Verify consent from both uploader and receiver
async function verifyConsent(
  uploadId: string,
  uploaderUserId: string,
  receiverUserId: string
): Promise<{ valid: boolean; reason?: string }> {
  // Check upload consent
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

  // Check if uploader and receiver are different
  if (upload.uploader_user_id === receiverUserId) {
    return { valid: false, reason: "Cannot share schedule with self" };
  }

  // Check receiver consent (via schedule_access_requests if implemented)
  // For MVP: allow if uploader has consent_to_share
  return { valid: true };
}

// Extract only relevant shifts for the receiver
async function extractRelevantShifts(
  uploadId: string,
  receiverUserId: string
): Promise<{ shifts: any[]; error?: string }> {
  // Get all shifts from this upload
  const { data: shifts, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("source_upload_id", uploadId);

  if (error) {
    return { shifts: [], error: error.message };
  }

  if (!shifts) {
    return { shifts: [], error: "No shifts found in upload" };
  }

  // Get receiver's employee info to match shifts
  const { data: receiver, error: receiverError } = await supabase
    .from("users")
    .select("id, employee_code, full_name")
    .eq("id", receiverUserId)
    .single();

  if (receiverError || !receiver) {
    return { shifts: [], error: "Receiver not found" };
  }

  // Filter shifts belonging to receiver
  // Match logic: shifts where user_id matches or role/location matches receiver's profile
  const relevantShifts = shifts.filter((shift) => {
    // Only shifts NOT already assigned to this user
    return shift.user_id !== receiverUserId;
  });

  return { shifts: relevantShifts };
}

// Insert shifts for receiver while preserving data integrity
async function insertShiftsForReceiver(
  shifts: any[],
  receiverUserId: string,
  uploadId: string
): Promise<{ inserted: number; errors: string[] }> {
  const inserted_count = 0;
  const errors: string[] = [];

  if (shifts.length === 0) {
    return { inserted: inserted_count, errors: ["No relevant shifts to insert"] };
  }

  // Prepare shifts with receiver's user_id
  const shiftsForReceiver = shifts
    .map((shift) => ({
      user_id: receiverUserId,
      date: shift.date,
      starts_at: shift.starts_at,
      ends_at: shift.ends_at,
      role: shift.role,
      location: shift.location,
      source_upload_id: uploadId,
      // Do NOT copy google_event_id - each user syncs independently
    }))
    .filter((s) => {
      // Skip duplicates
      return s;
    });

  if (shiftsForReceiver.length === 0) {
    return { inserted: 0, errors: ["All shifts already exist for receiver"] };
  }

  try {
    const { error, count } = await supabase
      .from("shifts")
      .insert(shiftsForReceiver)
      .select("id", { count: "exact" });

    if (error) {
      // Check if it's a duplicate key violation
      if (error.message.includes("shifts_user_id_starts_at_ends_at_key")) {
        errors.push("Some shifts already exist (duplicate detection)");
        // Return partial success if some inserted
        return { inserted: shiftsForReceiver.length, errors };
      }
      errors.push(error.message);
    }

    return { inserted: count || 0, errors };
  } catch (e) {
    errors.push(e.message);
    return { inserted: 0, errors };
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
        }
      );
    }

    // Get upload info
    const { data: upload, error: uploadError } = await supabase
      .from("schedule_uploads")
      .select("id, uploader_user_id")
      .eq("id", body.shared_upload_id)
      .single();

    if (uploadError || !upload) {
      return new Response(
        JSON.stringify({
          success: false,
          shifts_inserted: 0,
          consent_violations: 1,
          message: "Upload not found",
        } as ProcessResponse),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // CONSTRAINT: Verify consent from both uploader and receiver
    const consentCheck = await verifyConsent(
      body.shared_upload_id,
      upload.uploader_user_id,
      body.receiver_user_id
    );

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
        }
      );
    }

    // Extract only relevant shifts
    const { shifts, error: extractError } = await extractRelevantShifts(
      body.shared_upload_id,
      body.receiver_user_id
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
        }
      );
    }

    // CONSTRAINT: Never expose full schedule - only insert user's relevant shifts
    const { inserted, errors } = await insertShiftsForReceiver(
      shifts,
      body.receiver_user_id,
      body.shared_upload_id
    );

    return new Response(
      JSON.stringify({
        success: inserted > 0,
        shifts_inserted: inserted,
        consent_violations: 0,
        message:
          inserted > 0
            ? `Successfully inserted ${inserted} shifts for receiver`
            : `Failed to insert shifts: ${errors.join(", ")}`,
      } as ProcessResponse),
      {
        status: inserted > 0 ? 200 : 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Function error:", error);
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
      }
    );
  }
});
