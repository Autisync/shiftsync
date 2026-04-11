import type { ShiftData } from "@/types/shift";
import {
  buildShiftFingerprint,
  buildShiftSyncKey,
  resolveDateRangeFromShifts,
} from "@/features/calendar/utils/eventFingerprint";
import { extractEventMetadata } from "@/features/calendar/services/googleCalendarAdapter";
import type {
  CalendarDiffPlan,
  CalendarSyncOptions,
  CalendarSyncRecord,
  PreparedShiftEvent,
} from "@/features/calendar/types";

function normalizeText(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function dateOnlyFromIso(value: string): string {
  return value.slice(0, 10);
}

function minutesFromIso(value: string): number {
  const date = new Date(value);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function findFallbackRecord(
  prepared: PreparedShiftEvent,
  inScopeRecords: CalendarSyncRecord[],
  matchedRecordIds: Set<string>,
): CalendarSyncRecord | undefined {
  const targetTitle = normalizeText(prepared.title);
  const targetLocation = normalizeText(prepared.location);
  const targetDate = prepared.start.slice(0, 10);
  const targetStart = minutesFromIso(prepared.start);
  const targetStartDate = new Date(prepared.start);

  const unmatched = inScopeRecords.filter(
    (record) => !matchedRecordIds.has(record.id),
  );

  const candidates = unmatched.filter(
    (record) =>
      dateOnlyFromIso(record.syncedStart) === targetDate &&
      normalizeText(record.syncedTitle) === targetTitle,
  );

  const chooseClosestByStart = (
    list: CalendarSyncRecord[],
  ): CalendarSyncRecord | undefined => {
    if (list.length === 0) {
      return undefined;
    }

    if (list.length === 1) {
      return list[0];
    }

    // If multiple candidates exist, pick the one closest in start time.
    const sorted = [...list].sort((a, b) => {
      const deltaA = Math.abs(minutesFromIso(a.syncedStart) - targetStart);
      const deltaB = Math.abs(minutesFromIso(b.syncedStart) - targetStart);
      return deltaA - deltaB;
    });

    const best = sorted[0];
    const second = sorted[1];
    if (!second) {
      return best;
    }

    const bestDelta = Math.abs(minutesFromIso(best.syncedStart) - targetStart);
    const secondDelta = Math.abs(
      minutesFromIso(second.syncedStart) - targetStart,
    );

    // Avoid ambiguous reconciliation when two records are equally close.
    if (bestDelta === secondDelta) {
      return undefined;
    }

    return best;
  };

  const exactDayTitle = chooseClosestByStart(candidates);
  if (exactDayTitle) {
    return exactDayTitle;
  }

  // Relaxed fallback: allow date/title changes and match by location + temporal proximity.
  const relaxedCandidates = unmatched.filter((record) => {
    const recordLocation = normalizeText(record.syncedLocation);
    if (targetLocation && recordLocation && targetLocation !== recordLocation) {
      return false;
    }

    const deltaMs = Math.abs(
      new Date(record.syncedStart).getTime() - targetStartDate.getTime(),
    );
    const deltaHours = deltaMs / (60 * 60 * 1000);
    if (deltaHours > 48) {
      return false;
    }

    const recordTitle = normalizeText(record.syncedTitle);
    if (targetTitle && recordTitle && targetTitle === recordTitle) {
      return true;
    }

    // If title changed (e.g. notes edited), still reconcile by proximity.
    return true;
  });

  const sortedRelaxed = [...relaxedCandidates].sort((a, b) => {
    const deltaA =
      Math.abs(new Date(a.syncedStart).getTime() - targetStartDate.getTime()) /
      (60 * 1000);
    const deltaB =
      Math.abs(new Date(b.syncedStart).getTime() - targetStartDate.getTime()) /
      (60 * 1000);
    return deltaA - deltaB;
  });

  const bestRelaxed = sortedRelaxed[0];
  const secondRelaxed = sortedRelaxed[1];
  if (!bestRelaxed) {
    return undefined;
  }

  if (!secondRelaxed) {
    return bestRelaxed;
  }

  const bestDelta =
    Math.abs(
      new Date(bestRelaxed.syncedStart).getTime() - targetStartDate.getTime(),
    ) /
    (60 * 1000);
  const secondDelta =
    Math.abs(
      new Date(secondRelaxed.syncedStart).getTime() - targetStartDate.getTime(),
    ) /
    (60 * 1000);

  if (bestDelta === secondDelta) {
    return undefined;
  }

  return bestRelaxed;
}

function toDateOnly(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function isInRange(date: Date, range: { start: string; end: string }): boolean {
  const dateOnly = toDateOnly(date);
  return dateOnly >= range.start && dateOnly <= range.end;
}

function prepareShift(shift: ShiftData, userId: string): PreparedShiftEvent {
  const metadata = extractEventMetadata(shift);

  return {
    shift,
    shiftId: shift.id ?? null,
    syncShiftKey: buildShiftSyncKey(shift, userId),
    fingerprint: buildShiftFingerprint(shift),
    start: metadata.start,
    end: metadata.end,
    title: metadata.title,
    description: metadata.description,
    location: metadata.location,
  };
}

function resolveRange(
  shifts: ShiftData[],
  options: CalendarSyncOptions,
): { start: string; end: string } {
  return options.dateRange ?? resolveDateRangeFromShifts(shifts);
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function expandRange(range: { start: string; end: string }): {
  start: string;
  end: string;
} {
  return {
    start: addDays(range.start, -2),
    end: addDays(range.end, 2),
  };
}

function summarize(
  actions: CalendarDiffPlan["actions"],
): CalendarDiffPlan["summary"] {
  return actions.reduce(
    (acc, action) => {
      if (action.type === "create") acc.created += 1;
      if (action.type === "update") acc.updated += 1;
      if (action.type === "delete") acc.deleted += 1;
      if (action.type === "noop") acc.noop += 1;
      return acc;
    },
    { created: 0, updated: 0, deleted: 0, noop: 0, failed: 0 },
  );
}

export function buildCalendarDiffPlan(input: {
  shifts: ShiftData[];
  trackedRecords: CalendarSyncRecord[];
  options: CalendarSyncOptions;
}): CalendarDiffPlan {
  const { shifts, trackedRecords, options } = input;
  const authoritativeRange = resolveRange(shifts, options);
  const matchingRange = expandRange(authoritativeRange);
  const inScopeShifts = shifts.filter((shift) =>
    isInRange(shift.date, authoritativeRange),
  );
  const matchingRecords = trackedRecords.filter(
    (record) =>
      record.syncedStart.slice(0, 10) >= matchingRange.start &&
      record.syncedStart.slice(0, 10) <= matchingRange.end,
  );
  const staleDeletionRecords = matchingRecords;

  const recordsBySyncKey = new Map<string, CalendarSyncRecord>();
  const recordsByExternalEventId = new Map<string, CalendarSyncRecord>();

  for (const record of matchingRecords) {
    recordsBySyncKey.set(record.syncShiftKey, record);
    recordsByExternalEventId.set(record.externalEventId, record);
  }

  const matchedRecordIds = new Set<string>();
  const actions: CalendarDiffPlan["actions"] = [];

  const activePrepared = inScopeShifts
    .filter((shift) => shift.status !== "deleted")
    .map((shift) => prepareShift(shift, options.userId));

  for (const prepared of activePrepared) {
    const existingRecordByKeyOrEvent =
      (prepared.shift.googleEventId
        ? recordsByExternalEventId.get(prepared.shift.googleEventId)
        : undefined) ?? recordsBySyncKey.get(prepared.syncShiftKey);

    const existingRecord =
      existingRecordByKeyOrEvent ??
      findFallbackRecord(prepared, matchingRecords, matchedRecordIds);

    if (!existingRecord) {
      console.info("[CalendarSync][Match]", {
        shift_uid: prepared.syncShiftKey,
        google_event_id: prepared.shift.googleEventId ?? null,
        matched: false,
      });
      if (prepared.shift.googleEventId) {
        // Bridge case: the event already exists on Google Calendar (from a pre-Phase-3
        // sync or a manual sync) but we have no tracking record yet.
        // Treat as UPDATE so we don't create a duplicate.
        actions.push({
          type: "update",
          preparedShift: prepared,
          record: null,
          reason: "Event ID exists but tracking record is missing",
        });
      } else {
        actions.push({
          type: "create",
          preparedShift: prepared,
          record: null,
          reason: "No tracked record exists for this shift",
        });
      }
      continue;
    }

    matchedRecordIds.add(existingRecord.id);

    console.info("[CalendarSync][Match]", {
      shift_uid: prepared.syncShiftKey,
      google_event_id:
        existingRecord.externalEventId ?? prepared.shift.googleEventId ?? null,
      matched: true,
    });

    if (existingRecord.shiftFingerprint === prepared.fingerprint) {
      actions.push({
        type: "noop",
        preparedShift: prepared,
        record: existingRecord,
        reason: "Fingerprint unchanged",
      });
      continue;
    }

    actions.push({
      type: "update",
      preparedShift: prepared,
      record: existingRecord,
      reason: existingRecordByKeyOrEvent
        ? "Fingerprint changed"
        : "Matched by day/title/location fallback",
    });
  }

  const explicitDeletes = inScopeShifts
    .filter((shift) => shift.status === "deleted")
    .map((shift) => prepareShift(shift, options.userId));

  for (const prepared of explicitDeletes) {
    const record =
      (prepared.shift.googleEventId
        ? recordsByExternalEventId.get(prepared.shift.googleEventId)
        : undefined) ?? recordsBySyncKey.get(prepared.syncShiftKey);

    if (record && matchedRecordIds.has(record.id)) {
      continue;
    }

    if (!record && !prepared.shift.googleEventId) {
      // Nothing to delete — no tracked record and no known event ID.
      continue;
    }

    if (record) {
      matchedRecordIds.add(record.id);
    }

    actions.push({
      type: "delete",
      preparedShift: prepared,
      record: record ?? null,
      reason: "Shift marked deleted",
    });
  }

  const shouldDeleteStale = Boolean(
    options.fullResync || options.removeStaleEvents,
  );
  if (shouldDeleteStale) {
    for (const record of staleDeletionRecords) {
      if (matchedRecordIds.has(record.id)) {
        continue;
      }

      actions.push({
        type: "delete",
        preparedShift: null,
        record,
        reason: "Tracked event no longer exists in active schedule",
      });
      matchedRecordIds.add(record.id);
    }
  }

  return {
    actions,
    summary: summarize(actions),
  };
}
