import { buildCalendarEventPayload } from "@/lib/google-calendar";
import type { ShiftData } from "@/types/shift";
import { buildShiftUidFromShift } from "@/shared/utils/shift-uid";

function normalizeDate(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

function normalizeText(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function buildShiftSyncKey(shift: ShiftData, userId: string): string {
  const explicitUid = shift.shiftUid?.trim();
  if (explicitUid) {
    return `${userId}::uid:${explicitUid}`;
  }

  // Key MUST be stable across re-parses even when shift times or content change.
  // shift.id contains Date.now() (e.g. "shift-47-0-1775778823266") so it changes
  // every parse — never use it as the key.
  // Fallback to deterministic shift UID when parser did not provide one.
  return `${userId}::uid:${buildShiftUidFromShift(shift, userId)}`;
}

export function buildShiftFingerprint(shift: ShiftData): string {
  const payload = buildCalendarEventPayload(shift);
  const canonical = [
    normalizeText(payload.summary),
    payload.start?.dateTime ?? "",
    payload.end?.dateTime ?? "",
    normalizeText(payload.description),
    normalizeText(shift.location),
  ].join("|");

  return hashString(canonical);
}

export function resolveDateRangeFromShifts(shifts: ShiftData[]): {
  start: string;
  end: string;
} {
  if (shifts.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { start: today, end: today };
  }

  const values = shifts.map((shift) => new Date(shift.date).getTime());
  const min = Math.min(...values);
  const max = Math.max(...values);

  const minDate = new Date(min);
  const maxDate = new Date(max);

  return {
    start: minDate.toISOString().slice(0, 10),
    end: maxDate.toISOString().slice(0, 10),
  };
}
