import { getBackend } from "@/services/backend/backend-provider";
import { getSupabaseClient } from "@/lib/supabase-client";

export async function requestSharedScheduleAccess(params: {
  scheduleUploadId: string;
  requesterUserId: string;
  consentGiven: boolean;
}) {
  const backend = getBackend();
  return backend.uploads.createAccessRequest({
    scheduleUploadId: params.scheduleUploadId,
    requesterUserId: params.requesterUserId,
    consentGiven: params.consentGiven,
    status: params.consentGiven ? "approved" : "rejected",
    reviewedAt: null,
    reviewedByUserId: null,
  });
}

export async function recoverSharedSchedule(params: {
  sharedUploadId: string;
  receiverUserId: string;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await supabase.functions.invoke(
    "process-shared-schedule",
    {
      body: {
        shared_upload_id: params.sharedUploadId,
        receiver_user_id: params.receiverUserId,
      },
    },
  );

  if (error) {
    throw error;
  }

  return data as {
    success: boolean;
    shifts_inserted: number;
    consent_violations: number;
    message: string;
    calendar_sync_triggered?: boolean;
  };
}
