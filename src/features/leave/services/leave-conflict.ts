/**
 * src/features/leave/services/leave-conflict.ts
 *
 * Validates whether a leave date range conflicts with existing shifts.
 * Pure functions — no side effects, no Supabase.
 */

import type { Shift } from "@/types/domain";

export interface LeaveConflict {
  shiftId: string;
  date: string;
  startsAt: string;
  endsAt: string;
}

export interface LeaveConflictResult {
  hasConflicts: boolean;
  conflicts: LeaveConflict[];
}

/**
 * Returns all shifts that fall on dates within [startDate, endDate] (inclusive).
 * Date strings must be ISO date strings: "YYYY-MM-DD".
 */
export function detectLeaveConflicts(
  shifts: Shift[],
  startDate: string,
  endDate: string,
): LeaveConflictResult {
  const rangeStart = new Date(startDate);
  const rangeEnd = new Date(endDate);
  rangeStart.setUTCHours(0, 0, 0, 0);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  const conflicts: LeaveConflict[] = shifts
    .filter((shift) => {
      // shift.date is "YYYY-MM-DD" — compare as UTC midnight
      const shiftDate = new Date(`${shift.date}T00:00:00Z`);
      return shiftDate >= rangeStart && shiftDate <= rangeEnd;
    })
    .map((shift) => ({
      shiftId: shift.id,
      date: shift.date,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    }));

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}
