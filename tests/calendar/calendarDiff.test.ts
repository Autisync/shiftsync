import { describe, it, expect } from "vitest";
import { buildCalendarDiffPlan } from "../../src/features/calendar/services/calendarDiff";
import { buildShiftFingerprint } from "../../src/features/calendar/utils/eventFingerprint";
import { buildShiftUidFromShift } from "../../src/shared/utils/shift-uid";
import type {
  CalendarSyncRecord,
  CalendarSyncOptions,
} from "../../src/features/calendar/types";
import type { ShiftData } from "../../src/types/shift";

function shift(overrides: Partial<ShiftData> = {}): ShiftData {
  const base: ShiftData = {
    id: overrides.id ?? "shift-1",
    week: 1,
    date: overrides.date ?? new Date("2026-04-10T00:00:00.000Z"),
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "18:00",
    shiftType: overrides.shiftType ?? "morning",
    status: overrides.status ?? "active",
    employeeName: overrides.employeeName ?? "Alex",
    location: overrides.location ?? "Lisbon",
    notes: overrides.notes ?? "Desk A",
    googleEventId: overrides.googleEventId,
    lob: overrides.lob,
  };

  return {
    ...base,
    shiftUid: overrides.shiftUid ?? buildShiftUidFromShift(base, "user-1"),
  };
}

function defaultSyncKey(): string {
  const base = shift();
  return `user-1::uid:${base.shiftUid}`;
}

function record(
  overrides: Partial<CalendarSyncRecord> = {},
): CalendarSyncRecord {
  return {
    id: overrides.id ?? "rec-1",
    userId: "user-1",
    provider: "google",
    calendarId: "primary",
    shiftId: overrides.shiftId ?? "shift-1",
    syncShiftKey: overrides.syncShiftKey ?? defaultSyncKey(),
    externalEventId: overrides.externalEventId ?? "evt-1",
    shiftFingerprint: overrides.shiftFingerprint ?? "abc",
    syncedStart: overrides.syncedStart ?? "2026-04-10T09:00:00.000Z",
    syncedEnd: overrides.syncedEnd ?? "2026-04-10T18:00:00.000Z",
    syncedTitle: overrides.syncedTitle ?? "Shift - Morning",
    syncedDescription: overrides.syncedDescription ?? "Desk A",
    syncedLocation: overrides.syncedLocation ?? "Lisbon",
    lastSyncedAt: overrides.lastSyncedAt ?? "2026-04-01T00:00:00.000Z",
    syncStatus: overrides.syncStatus ?? "ok",
    lastError: overrides.lastError ?? null,
  };
}

const options: CalendarSyncOptions = {
  userId: "user-1",
  provider: "google",
  calendarId: "primary",
  removeStaleEvents: true,
  dateRange: {
    start: "2026-04-01",
    end: "2026-04-30",
  },
};

describe("calendar diff engine", () => {
  it("creates when a new shift appears", () => {
    const plan = buildCalendarDiffPlan({
      shifts: [shift()],
      trackedRecords: [],
      options,
    });

    expect(plan.summary.created).toBe(1);
    expect(plan.actions[0].type).toBe("create");
  });

  it("updates when shift fingerprint changes", () => {
    const plan = buildCalendarDiffPlan({
      shifts: [shift({ location: "Porto" })],
      trackedRecords: [record({ shiftFingerprint: "old-fingerprint" })],
      options,
    });

    expect(plan.summary.updated).toBe(1);
    expect(plan.actions.some((a) => a.type === "update")).toBe(true);
  });

  it("deletes when shift disappears from active set", () => {
    const plan = buildCalendarDiffPlan({
      shifts: [],
      trackedRecords: [record()],
      options,
    });

    expect(plan.summary.deleted).toBe(1);
    expect(plan.actions[0].type).toBe("delete");
  });

  it("marks noop when unchanged", () => {
    const unchanged = shift();
    const plan = buildCalendarDiffPlan({
      shifts: [unchanged],
      trackedRecords: [
        record({ shiftFingerprint: buildShiftFingerprint(unchanged) }),
      ],
      options,
    });

    expect(plan.summary.noop).toBe(1);
  });

  it("never deletes when stale removal is disabled", () => {
    const plan = buildCalendarDiffPlan({
      shifts: [],
      trackedRecords: [record()],
      options: {
        ...options,
        removeStaleEvents: false,
        fullResync: false,
      },
    });

    expect(plan.summary.deleted).toBe(0);
  });

  it("is repeat-safe and does not create duplicates on unchanged reruns", () => {
    const unchanged = shift();
    const first = buildCalendarDiffPlan({
      shifts: [unchanged],
      trackedRecords: [
        record({ shiftFingerprint: buildShiftFingerprint(unchanged) }),
      ],
      options,
    });

    const second = buildCalendarDiffPlan({
      shifts: [unchanged],
      trackedRecords: [
        record({ shiftFingerprint: buildShiftFingerprint(unchanged) }),
      ],
      options,
    });

    expect(first.summary.created).toBe(0);
    expect(second.summary.created).toBe(0);
    expect(second.summary.noop).toBe(1);
  });

  it("matches by day/title nearest start when sync key drifts", () => {
    const changedTime = shift({
      startTime: "10:00",
      endTime: "19:00",
      shiftUid: "new-key",
    });

    const previous = record({
      syncShiftKey: "user-1::uid:old-key",
      syncedStart: "2026-04-10T09:00:00.000Z",
      syncedEnd: "2026-04-10T18:00:00.000Z",
      syncedTitle: "OPS - Morning",
      syncedLocation: "Lisbon",
      shiftFingerprint: "old-fingerprint",
    });

    const plan = buildCalendarDiffPlan({
      shifts: [{ ...changedTime, lob: "OPS", location: "Lisbon" }],
      trackedRecords: [previous],
      options,
    });

    expect(plan.summary.updated).toBe(1);
    expect(plan.summary.created).toBe(0);
    expect(plan.actions[0].type).toBe("update");
  });

  it("does not delete tracked events outside the imported date span", () => {
    const plan = buildCalendarDiffPlan({
      shifts: [shift({ date: new Date("2026-04-15T00:00:00.000Z") })],
      trackedRecords: [
        record({
          syncedStart: "2026-04-21T09:00:00.000Z",
          syncedEnd: "2026-04-21T18:00:00.000Z",
          syncShiftKey: "user-1::uid:future-key",
        }),
      ],
      options: {
        userId: "user-1",
        provider: "google",
        calendarId: "primary",
        removeStaleEvents: true,
      },
    });

    expect(plan.summary.deleted).toBe(0);
  });
});
