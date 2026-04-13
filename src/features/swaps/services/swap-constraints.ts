/**
 * src/features/swaps/services/swap-constraints.ts
 *
 * Validation engine for swap constraints:
 * - Max 60 hours per week
 * - Max 6 consecutive days
 * - Returns structured violations array
 */

import type { Shift } from "@/types/domain";

export interface ConstraintShift {
  date: string;
  startsAt: string;
  endsAt: string;
}

export interface ConstraintViolation {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  violations: ConstraintViolation[];
}

export interface ScheduleValidationOptions {
  enforceMinRestHours?: boolean;
  minRestHours?: number;
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

function getDateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date(value).toISOString().slice(0, 10);
}

function getMaxConsecutiveWorkedDays(shifts: ConstraintShift[]): number {
  const uniqueDates = Array.from(new Set(shifts.map((shift) => shift.date)))
    .map((date) => new Date(`${date}T00:00:00.000Z`).getTime())
    .sort((a, b) => a - b);

  if (uniqueDates.length === 0) {
    return 0;
  }

  let maxConsecutive = 1;
  let currentConsecutive = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const diffDays =
      (uniqueDates[i] - uniqueDates[i - 1]) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      currentConsecutive += 1;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 1;
    }
  }

  return maxConsecutive;
}

function getWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - day);
  return weekStart.toISOString().slice(0, 10);
}

function getHoursForWeek(
  shifts: ConstraintShift[],
  weekStartIso: string,
): number {
  const weekStart = new Date(`${weekStartIso}T00:00:00.000Z`);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  return shifts.reduce((total, shift) => {
    const start = new Date(shift.startsAt).getTime();
    const end = new Date(shift.endsAt).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return total;
    }

    const overlapStart = Math.max(start, weekStart.getTime());
    const overlapEnd = Math.min(end, weekEnd.getTime());

    if (overlapEnd <= overlapStart) {
      return total;
    }

    return total + (overlapEnd - overlapStart) / (1000 * 60 * 60);
  }, 0);
}

function findRestViolations(
  shifts: ConstraintShift[],
  minRestHours: number,
): Array<{ previousEndsAt: string; nextStartsAt: string; restHours: number }> {
  const sorted = [...shifts].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const issues: Array<{
    previousEndsAt: string;
    nextStartsAt: string;
    restHours: number;
  }> = [];

  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = new Date(sorted[i - 1].endsAt).getTime();
    const nextStart = new Date(sorted[i].startsAt).getTime();
    if (Number.isNaN(prevEnd) || Number.isNaN(nextStart)) {
      continue;
    }

    const gapHours = (nextStart - prevEnd) / (1000 * 60 * 60);
    if (gapHours < minRestHours) {
      issues.push({
        previousEndsAt: sorted[i - 1].endsAt,
        nextStartsAt: sorted[i].startsAt,
        restHours: gapHours,
      });
    }
  }

  return issues;
}

/**
 * Pure schedule validator used by upload/parser warnings and swap validations.
 * No side effects, no database writes.
 */
export function validateScheduleConstraints(
  shifts: ConstraintShift[],
  options: ScheduleValidationOptions = {},
): ValidationResult {
  const violations: ConstraintViolation[] = [];
  const normalized = shifts
    .map((shift) => ({
      date: getDateOnly(shift.date),
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    }))
    .filter((shift) => !Number.isNaN(new Date(shift.startsAt).getTime()));

  const weekStarts = Array.from(
    new Set(normalized.map((shift) => getWeekStart(shift.date))),
  );
  for (const weekStart of weekStarts) {
    const hours = getHoursForWeek(normalized, weekStart);
    if (hours > 60) {
      violations.push({
        code: "MAX_HOURS_EXCEEDED",
        message: `Regra 6/60 violada: ${hours.toFixed(1)}h na semana de ${weekStart}.`,
        details: {
          hours,
          weekStart,
        },
      });
    }
  }

  const maxConsecutiveDays = getMaxConsecutiveWorkedDays(normalized);
  if (maxConsecutiveDays > 6) {
    violations.push({
      code: "MAX_CONSECUTIVE_DAYS_EXCEEDED",
      message: `Regra 6/60 violada: ${maxConsecutiveDays} dias consecutivos trabalhados.`,
      details: {
        consecutiveDays: maxConsecutiveDays,
      },
    });
  }

  if (options.enforceMinRestHours) {
    const minRestHours = options.minRestHours ?? 11;
    const restViolations = findRestViolations(normalized, minRestHours);
    if (restViolations.length > 0) {
      violations.push({
        code: "MIN_REST_HOURS_VIOLATED",
        message: `Descanso minimo violado: ${restViolations.length} transicao(oes) com menos de ${minRestHours}h.`,
        details: {
          minRestHours,
          transitions: restViolations,
        },
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
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
      message:
        "Troca nao possivel devido a regra 6/60 (turno do requisitante nao encontrado).",
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
        message: `Troca nao possivel devido a regra 6/60: o requisitante excederia 60 horas por semana (${hoursInWeek.toFixed(1)}h).`,
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
        message: `Troca nao possivel devido a regra 6/60: o requisitante excederia 6 dias consecutivos (${consecutiveDays} dias).`,
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
        message: `Troca nao possivel devido a regra 6/60: o colega excederia 60 horas por semana (${hoursInWeek.toFixed(1)}h).`,
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
        message: `Troca nao possivel devido a regra 6/60: o colega excederia 6 dias consecutivos (${consecutiveDays} dias).`,
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
