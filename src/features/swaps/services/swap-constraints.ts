/**
 * src/features/swaps/services/swap-constraints.ts
 *
 * Validation engine for swap constraints:
 * - Max 60 hours per week
 * - Max 6 consecutive days
 * - Returns structured violations array
 */

import type { Shift } from "@/types/domain";

export interface ConstraintViolation {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
}

function getWeekBounds(date: string): { start: Date; end: Date } {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay();
  const startOfWeek = new Date(d);
  startOfWeek.setUTCDate(d.getUTCDate() - dayOfWeek);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);
  return { start: startOfWeek, end: endOfWeek };
}

function getHoursInWeek(shifts: Shift[], targetDate: string): number {
  const { start, end } = getWeekBounds(targetDate);
  return shifts.reduce((total, shift) => {
    const shiftStart = new Date(shift.startsAt).getTime();
    const shiftEnd = new Date(shift.endsAt).getTime();
    const rangeStart = start.getTime();
    const rangeEnd = end.getTime();

    if (shiftEnd <= rangeStart || shiftStart >= rangeEnd) {
      return total;
    }

    const overlapStart = Math.max(shiftStart, rangeStart);
    const overlapEnd = Math.min(shiftEnd, rangeEnd);
    const hours = (overlapEnd - overlapStart) / (1000 * 60 * 60);
    return total + hours;
  }, 0);
}

function getConsecutiveDays(shifts: Shift[], upToDate: string): number {
  if (shifts.length === 0) return 0;

  const sortedByDate = [...shifts]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((s) => new Date(s.date) <= new Date(upToDate));

  if (sortedByDate.length === 0) return 0;

  let maxConsecutive = 1;
  let currentConsecutive = 1;

  for (let i = 1; i < sortedByDate.length; i++) {
    const prevDate = new Date(sortedByDate[i - 1].date);
    const currDate = new Date(sortedByDate[i].date);
    const daysDiff =
      (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff === 1) {
      currentConsecutive += 1;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 1;
    }
  }

  return maxConsecutive;
}

/**
 * Validate swap constraints after accepting a swap.
 * Checks if either user would violate rules when the swap is applied.
 *
 * @param requesterShifts All shifts for the requester (including the own shift being swapped)
 * @param targetShifts All shifts for the target (including the target shift being swapped)
 * @param ownShiftId Shift ID being swapped by requester
 * @param targetShiftId Shift ID being swapped by target (may be null for partial swaps)
 * @returns ValidationResult with violations array
 */
export function validateSwapConstraints(input: {
  requesterShifts: Shift[];
  targetShifts: Shift[];
  ownShiftId: string;
  targetShiftId: string | null;
}): ValidationResult {
  const violations: ConstraintViolation[] = [];

  // Find the shifts being swapped
  const requesterOwnShift = input.requesterShifts.find(
    (s) => s.id === input.ownShiftId,
  );
  const targetIncomingShift = input.targetShiftId
    ? input.targetShifts.find((s) => s.id === input.targetShiftId)
    : null;

  if (!requesterOwnShift) {
    violations.push({
      code: "SHIFT_NOT_FOUND",
      message: "Requester shift not found",
      details: { shiftId: input.ownShiftId },
    });
    return { valid: false, violations };
  }

  // ─ Requester perspective: loses own shift, gains target shift
  {
    const shiftsAfterSwap = input.requesterShifts.filter(
      (s) => s.id !== input.ownShiftId,
    );
    if (targetIncomingShift) {
      shiftsAfterSwap.push(targetIncomingShift);
    }

    const hoursInWeek = getHoursInWeek(shiftsAfterSwap, requesterOwnShift.date);
    if (hoursInWeek > 60) {
      violations.push({
        code: "MAX_HOURS_EXCEEDED_REQUESTER",
        message: `Requester would exceed 60 hours/week (${hoursInWeek.toFixed(1)} hours)`,
        details: {
          hours: hoursInWeek,
          userId: input.requesterShifts[0].userId,
        },
      });
    }

    const consecutiveDays = getConsecutiveDays(
      shiftsAfterSwap,
      requesterOwnShift.date,
    );
    if (consecutiveDays > 6) {
      violations.push({
        code: "MAX_CONSECUTIVE_DAYS_EXCEEDED_REQUESTER",
        message: `Requester would exceed 6 consecutive days (${consecutiveDays} days)`,
        details: {
          consecutiveDays,
          userId: input.requesterShifts[0].userId,
        },
      });
    }
  }

  // ─ Target perspective: loses target shift, gains requester shift
  if (targetIncomingShift) {
    const shiftsAfterSwap = input.targetShifts.filter(
      (s) => s.id !== input.targetShiftId,
    );
    shiftsAfterSwap.push(requesterOwnShift);

    const hoursInWeek = getHoursInWeek(
      shiftsAfterSwap,
      targetIncomingShift.date,
    );
    if (hoursInWeek > 60) {
      violations.push({
        code: "MAX_HOURS_EXCEEDED_TARGET",
        message: `Target would exceed 60 hours/week (${hoursInWeek.toFixed(1)} hours)`,
        details: { hours: hoursInWeek, userId: targetIncomingShift.userId },
      });
    }

    const consecutiveDays = getConsecutiveDays(
      shiftsAfterSwap,
      targetIncomingShift.date,
    );
    if (consecutiveDays > 6) {
      violations.push({
        code: "MAX_CONSECUTIVE_DAYS_EXCEEDED_TARGET",
        message: `Target would exceed 6 consecutive days (${consecutiveDays} days)`,
        details: {
          consecutiveDays,
          userId: targetIncomingShift.userId,
        },
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
