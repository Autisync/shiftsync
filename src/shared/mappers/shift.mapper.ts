/**
 * src/shared/mappers/shift.mapper.ts
 *
 * Maps Supabase DB row → Shift domain model.
 */

import type { Database } from "@/types/supabase";
import type { Shift } from "@/types/domain";

type DbShiftRow = Database["public"]["Tables"]["shifts"]["Row"];

export function toShift(row: DbShiftRow): Shift {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    role: row.role,
    location: row.location,
    googleEventId: row.google_event_id,
    sourceUploadId: row.source_upload_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
