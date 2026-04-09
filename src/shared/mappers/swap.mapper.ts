/**
 * src/shared/mappers/swap.mapper.ts
 *
 * Maps Supabase DB rows → SwapAvailability and SwapRequest domain models.
 */

import type { Database } from "@/types/supabase";
import type { SwapAvailability, SwapRequest } from "@/types/domain";

type DbSwapAvailRow = Database["public"]["Tables"]["swap_availability"]["Row"];
type DbSwapRequestRow = Database["public"]["Tables"]["swap_requests"]["Row"];

export function toSwapAvailability(row: DbSwapAvailRow): SwapAvailability {
  return {
    id: row.id,
    shiftId: row.shift_id,
    isOpen: row.is_open,
    openedByUserId: row.opened_by_user_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSwapRequest(row: DbSwapRequestRow): SwapRequest {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    targetUserId: row.target_user_id,
    requesterShiftId: row.requester_shift_id,
    targetShiftId: row.target_shift_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
