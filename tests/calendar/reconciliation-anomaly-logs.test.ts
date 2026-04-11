import { describe, expect, it, vi } from "vitest";
import { CalendarSyncService } from "../../src/features/calendar/services/calendarSyncService";
import type {
  CalendarSyncRecord,
  CalendarSyncRecordRepository,
} from "../../src/features/calendar/types";
import type { ShiftData, CalendarEvent } from "../../src/types/shift";
import { buildShiftUid } from "../../src/shared/utils/shift-uid";

class StaticRecordRepo implements CalendarSyncRecordRepository {
  constructor(private readonly records: CalendarSyncRecord[]) {}

  async getRecordsForRange(): Promise<CalendarSyncRecord[]> {
    return this.records;
  }

  async upsertRecord(): Promise<void> {
    return;
  }

  async deleteRecord(): Promise<void> {
    return;
  }

  async markFailed(): Promise<void> {
    return;
  }
}

class NoopAdapter {
  async getEvent(): Promise<CalendarEvent> {
    throw Object.assign(new Error("not found"), { status: 404 });
  }

  async createEvent(
    _calendarId: string,
    _shift: ShiftData,
  ): Promise<CalendarEvent> {
    return {
      id: "evt-created",
      summary: "Shift",
      start: { dateTime: new Date().toISOString(), timeZone: "Europe/Lisbon" },
      end: { dateTime: new Date().toISOString(), timeZone: "Europe/Lisbon" },
      description: "",
    };
  }

  async updateEvent(
    _calendarId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    return {
      id: eventId,
      summary: "Shift",
      start: { dateTime: new Date().toISOString(), timeZone: "Europe/Lisbon" },
      end: { dateTime: new Date().toISOString(), timeZone: "Europe/Lisbon" },
      description: "",
    };
  }

  async deleteEvent(): Promise<void> {
    return;
  }
}

function makeShift(input: {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftUid?: string;
  location?: string;
}): ShiftData {
  const date = new Date(`${input.date}T00:00:00.000Z`);
  return {
    id: input.id,
    shiftUid:
      input.shiftUid ??
      buildShiftUid({
        userId: input.userId,
        date,
        startTime: input.startTime,
        endTime: input.endTime,
      }),
    week: 1,
    date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType: "morning",
    status: "active",
    notes: "agent",
    location: input.location ?? "Lisbon",
    lob: "OPS",
  };
}

const baseOptions = {
  userId: "u-logs",
  provider: "google" as const,
  calendarId: "primary",
  removeStaleEvents: true,
};

describe("reconciliation anomaly logs", () => {
  it("logs duplicate creation detection", async () => {
    const duplicate = makeShift({
      id: "s-1",
      userId: "u-logs",
      date: "2026-04-10",
      startTime: "09:00",
      endTime: "18:00",
    });

    const service = new CalendarSyncService(
      new StaticRecordRepo([]),
      () => new NoopAdapter() as never,
    );

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await service.apply({
      shifts: [{ ...duplicate }, { ...duplicate, id: "s-2" }],
      accessToken: "token",
      options: baseOptions,
    });

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("DUPLICATE DETECTED: shift_uid recreated"),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
  });

  it("logs update-not-matched anomaly", async () => {
    const shift = makeShift({
      id: "s-update",
      userId: "u-logs",
      date: "2026-04-11",
      startTime: "10:00",
      endTime: "19:00",
    });

    const tracked: CalendarSyncRecord = {
      id: "rec-update",
      userId: "u-logs",
      provider: "google",
      calendarId: "primary",
      shiftId: "legacy",
      syncShiftKey: `u-logs::uid:${shift.shiftUid}`,
      externalEventId: "",
      shiftFingerprint: "old",
      syncedStart: "2026-04-11T09:00:00.000Z",
      syncedEnd: "2026-04-11T18:00:00.000Z",
      syncedTitle: "OPS - Morning",
      syncedDescription: "agent",
      syncedLocation: "Lisbon",
      lastSyncedAt: new Date().toISOString(),
      syncStatus: "ok",
      lastError: null,
    };

    const service = new CalendarSyncService(
      new StaticRecordRepo([tracked]),
      () => new NoopAdapter() as never,
    );

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await service.apply({
      shifts: [shift],
      accessToken: "token",
      options: baseOptions,
    });

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("UPDATE FAILED: existing shift not matched"),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
  });

  it("logs delete-orphan anomaly", async () => {
    const tracked: CalendarSyncRecord = {
      id: "rec-delete",
      userId: "u-logs",
      provider: "google",
      calendarId: "primary",
      shiftId: null,
      syncShiftKey: "u-logs::uid:orphan",
      externalEventId: "",
      shiftFingerprint: "x",
      syncedStart: "2026-04-12T09:00:00.000Z",
      syncedEnd: "2026-04-12T18:00:00.000Z",
      syncedTitle: "OPS - Morning",
      syncedDescription: "agent",
      syncedLocation: "Lisbon",
      lastSyncedAt: new Date().toISOString(),
      syncStatus: "ok",
      lastError: null,
    };

    const service = new CalendarSyncService(
      new StaticRecordRepo([tracked]),
      () => new NoopAdapter() as never,
    );

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await service.apply({
      shifts: [],
      accessToken: "token",
      options: {
        ...baseOptions,
        dateRange: {
          start: "2026-04-01",
          end: "2026-04-30",
        },
      },
    });

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("DELETE FAILED: orphan calendar event"),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
  });

  it("logs identity inconsistency anomaly", async () => {
    const canonicalA = makeShift({
      id: "s-a",
      userId: "u-logs",
      date: "2026-04-13",
      startTime: "09:00",
      endTime: "18:00",
      shiftUid: "su_custom_a",
    });

    const canonicalB = makeShift({
      id: "s-b",
      userId: "u-logs",
      date: "2026-04-13",
      startTime: "09:00",
      endTime: "18:00",
      shiftUid: "su_custom_b",
    });

    const service = new CalendarSyncService(
      new StaticRecordRepo([]),
      () => new NoopAdapter() as never,
    );

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await service.apply({
      shifts: [canonicalA, canonicalB],
      accessToken: "token",
      options: baseOptions,
    });

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes("IDENTITY ERROR: inconsistent shift_uid"),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
  });
});
