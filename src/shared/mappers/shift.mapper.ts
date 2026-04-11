/**
 * src/shared/mappers/shift.mapper.ts
 *
 * Maps Supabase DB row → Shift domain model.
 */

import type { Database } from "@/types/supabase";
import type { Shift } from "@/types/domain";

type DbShiftRow = Database["public"]["Tables"]["shifts"]["Row"];

export function toShift(row: DbShiftRow): Shift {
  const extended = row as DbShiftRow & {
    shift_uid?: string | null;
    upload_batch_id?: string | null;
    status?: "active" | "deleted" | null;
    last_seen_at?: string | null;
  };

  return {
    id: row.id,
    userId: row.user_id,
    shiftUid: extended.shift_uid ?? null,
    date: row.date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    role: row.role,
    location: row.location,
    googleEventId: row.google_event_id,
    sourceUploadId: row.source_upload_id,
    uploadBatchId: extended.upload_batch_id ?? null,
    status: extended.status ?? null,
    lastSeenAt: extended.last_seen_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
