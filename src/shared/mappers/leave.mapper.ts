/**
 * src/shared/mappers/leave.mapper.ts
 *
 * Maps Supabase DB row → LeaveRequest domain model.
 */

import type { Database } from "@/types/supabase";
import type { LeaveRequest } from "@/types/domain";

type DbLeaveRow = Database["public"]["Tables"]["leave_requests"]["Row"];

export function toLeaveRequest(row: DbLeaveRow): LeaveRequest {
  return {
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
