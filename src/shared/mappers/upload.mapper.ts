/**
 * src/shared/mappers/upload.mapper.ts
 *
 * Maps Supabase DB rows → ScheduleUpload and ScheduleAccessRequest domain models.
 */

import type { Database, Json } from "@/types/supabase";
import type { ScheduleUpload, ScheduleAccessRequest } from "@/types/domain";

type DbUploadRow = Database["public"]["Tables"]["schedule_uploads"]["Row"];
type DbAccessRequestRow =
  Database["public"]["Tables"]["schedule_access_requests"]["Row"];

function jsonToRecord(value: Json): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function toScheduleUpload(row: DbUploadRow): ScheduleUpload {
  const meta = jsonToRecord(row.metadata);
  return {
    id: row.id,
    uploaderUserId: row.uploader_user_id,
    fileHash: row.file_hash,
    consentToShare: row.consent_to_share,
    metadata: meta,
    processingStatus:
      (meta.processing_status as ScheduleUpload["processingStatus"]) ??
      "uploaded",
    processingError: (meta.processing_error as string | null) ?? null,
    normalizedCoverageStart:
      (meta.normalized_coverage_start as string | null) ?? null,
    normalizedCoverageEnd:
      (meta.normalized_coverage_end as string | null) ?? null,
    trustLevel: (meta.trust_level as ScheduleUpload["trustLevel"]) ?? null,
    trustScore:
      typeof meta.trust_score === "number"
        ? meta.trust_score
        : Number(meta.trust_score ?? NaN) || null,
    trustReason: (meta.trust_reason as string | null) ?? null,
    selectedForSyncAt: (meta.selected_for_sync_at as string | null) ?? null,
    uploadedAt: row.uploaded_at,
  };
}

export function toScheduleAccessRequest(
  row: DbAccessRequestRow,
): ScheduleAccessRequest {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    scheduleUploadId: row.schedule_upload_id,
    consentGiven: row.consent_given,
    status: row.status,
    reviewedAt: row.reviewed_at,
    reviewedByUserId: row.reviewed_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
