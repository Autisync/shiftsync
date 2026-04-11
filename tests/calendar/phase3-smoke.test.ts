import { describe, expect, it } from "vitest";
import { CalendarSyncService } from "../../src/features/calendar/services/calendarSyncService";
import type {
  CalendarSyncRecord,
  CalendarSyncRecordRepository,
} from "../../src/features/calendar/types";
import type { ShiftData, CalendarEvent } from "../../src/types/shift";
import { buildShiftUid } from "../../src/shared/utils/shift-uid";

class InMemoryRecordRepo implements CalendarSyncRecordRepository {
  private byId = new Map<string, CalendarSyncRecord>();
  private bySyncKey = new Map<string, string>();
  private byExternalEventId = new Map<string, string>();

  async getRecordsForRange(input: {
    userId: string;
    provider: "google";
    calendarId: string;
    range: { start: string; end: string };
  }): Promise<CalendarSyncRecord[]> {
    return [...this.byId.values()].filter((record) => {
      return (
        record.userId === input.userId &&
        record.provider === input.provider &&
        record.calendarId === input.calendarId &&
        record.syncedStart.slice(0, 10) >= input.range.start &&
        record.syncedStart.slice(0, 10) <= input.range.end
      );
    });
  }

  async upsertRecord(input: {
    userId: string;
    provider: "google";
    calendarId: string;
    shiftId: string | null;
    syncShiftKey: string;
    externalEventId: string;
    shiftFingerprint: string;
    syncedStart: string;
    syncedEnd: string;
    syncedTitle: string;
    syncedDescription: string;
    syncedLocation: string;
    syncStatus: "ok" | "failed";
    lastError?: string | null;
  }): Promise<void> {
    const existingId = this.bySyncKey.get(input.syncShiftKey);
    const existingByExternal = this.byExternalEventId.get(
      input.externalEventId,
    );

    const id = existingId ?? existingByExternal ?? `rec-${this.byId.size + 1}`;

    // Re-key tracking row when sync key changes for the same external event.
    if (!existingId && existingByExternal) {
      const old = this.byId.get(existingByExternal);
      if (old) {
        this.bySyncKey.delete(old.syncShiftKey);
      }
    }

    const record: CalendarSyncRecord = {
      id,
      userId: input.userId,
      provider: input.provider,
      calendarId: input.calendarId,
      shiftId: input.shiftId,
      syncShiftKey: input.syncShiftKey,
      externalEventId: input.externalEventId,
      shiftFingerprint: input.shiftFingerprint,
      syncedStart: input.syncedStart,
      syncedEnd: input.syncedEnd,
      syncedTitle: input.syncedTitle,
      syncedDescription: input.syncedDescription,
      syncedLocation: input.syncedLocation,
      lastSyncedAt: new Date().toISOString(),
      syncStatus: input.syncStatus,
      lastError: input.lastError ?? null,
    };

    this.bySyncKey.set(input.syncShiftKey, id);
    this.byId.set(id, record);
    this.byExternalEventId.set(input.externalEventId, id);
  }

  async deleteRecord(recordId: string): Promise<void> {
    const existing = this.byId.get(recordId);
    if (!existing) return;
    this.bySyncKey.delete(existing.syncShiftKey);
    this.byExternalEventId.delete(existing.externalEventId);
    this.byId.delete(recordId);
  }

  async markFailed(recordId: string, message: string): Promise<void> {
    const existing = this.byId.get(recordId);
    if (!existing) return;
    this.byId.set(recordId, {
      ...existing,
      syncStatus: "failed",
      lastError: message,
    });
  }

  count(): number {
    return this.byId.size;
  }
}

class FakeCalendarAdapter {
  private events = new Map<string, CalendarEvent>();
  private nextId = 1;

  created = 0;
  updated = 0;
  deleted = 0;

  async getEvent(_calendarId: string, eventId: string): Promise<CalendarEvent> {
    const found = this.events.get(eventId);
    if (!found) {
      const err = new Error("Not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    return found;
  }

  async createEvent(
    _calendarId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent> {
    this.created += 1;
    const id = `evt-${this.nextId++}`;
    const start = new Date(shift.date);
    const [sh, sm] = shift.startTime.split(":").map(Number);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(shift.date);
    const [eh, em] = shift.endTime.split(":").map(Number);
    end.setHours(eh, em, 0, 0);

    const event: CalendarEvent = {
      id,
      summary: shift.lob ? `${shift.lob} - Morning` : "Shift - Morning",
      start: { dateTime: start.toISOString(), timeZone: "Europe/Lisbon" },
      end: { dateTime: end.toISOString(), timeZone: "Europe/Lisbon" },
      description: shift.notes ?? "",
    };

    this.events.set(id, event);
    return event;
  }

  async updateEvent(
    _calendarId: string,
    eventId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent> {
    this.updated += 1;
    const existing = this.events.get(eventId);
    if (!existing) {
      const err = new Error("Not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    const start = new Date(shift.date);
    const [sh, sm] = shift.startTime.split(":").map(Number);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(shift.date);
    const [eh, em] = shift.endTime.split(":").map(Number);
    end.setHours(eh, em, 0, 0);

    const updated: CalendarEvent = {
      ...existing,
      start: { ...existing.start, dateTime: start.toISOString() },
      end: { ...existing.end, dateTime: end.toISOString() },
      description: shift.notes ?? existing.description,
    };

    this.events.set(eventId, updated);
    return updated;
  }

  async deleteEvent(_calendarId: string, eventId: string): Promise<void> {
    if (this.events.has(eventId)) {
      this.deleted += 1;
      this.events.delete(eventId);
    }
  }

  eventCount(): number {
    return this.events.size;
  }

  async listEvents(
    _calendarId: string,
    _input: { timeMin: string; timeMax: string },
  ): Promise<CalendarEvent[]> {
    return [...this.events.values()];
  }
}

function makeShift(input: {
  parseId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  role: string;
  lob?: string;
  status?: "active" | "modified" | "deleted";
  googleEventId?: string;
}): ShiftData {
  const date = new Date(`${input.date}T00:00:00.000Z`);
  const uid = buildShiftUid({
    userId: input.userId,
    date,
    startTime: input.startTime,
    endTime: input.endTime,
    role: input.role,
  });

  return {
    id: input.parseId,
    shiftUid: uid,
    week: 1,
    date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType: "morning",
    status: input.status ?? "active",
    notes: input.role,
    employeeName: "Alex",
    lob: input.lob ?? "OPS",
    location: input.location,
    googleEventId: input.googleEventId,
  };
}

describe("phase 3 smoke scenarios", () => {
  it("same upload twice -> no duplicates; modify one -> one update; remove one -> one delete", async () => {
    const userId = "user-1";
    const calendarId = "primary";

    const repo = new InMemoryRecordRepo();
    const adapter = new FakeCalendarAdapter();
    const service = new CalendarSyncService(repo, () => adapter as never);

    const options = {
      userId,
      provider: "google" as const,
      calendarId,
      removeStaleEvents: true,
    };

    const upload1 = [
      makeShift({
        parseId: "shift-parse-a-1",
        userId,
        date: "2026-04-10",
        startTime: "09:00",
        endTime: "18:00",
        location: "Lisbon",
        role: "agent",
      }),
      makeShift({
        parseId: "shift-parse-b-1",
        userId,
        date: "2026-04-11",
        startTime: "09:00",
        endTime: "18:00",
        location: "Porto",
        role: "agent",
      }),
    ];

    const r1 = await service.apply({
      shifts: upload1,
      accessToken: "token",
      options,
    });

    expect(r1.summary.created).toBe(2);
    expect(r1.summary.updated).toBe(0);
    expect(r1.summary.deleted).toBe(0);
    expect(adapter.eventCount()).toBe(2);
    expect(repo.count()).toBe(2);
    expect(r1.syncedShifts.every((s) => Boolean(s.googleEventId))).toBe(true);

    // Same file re-upload: parser IDs differ but shift_uid remains stable.
    const upload2Same = [
      makeShift({
        parseId: "shift-parse-a-2",
        userId,
        date: "2026-04-10",
        startTime: "09:00",
        endTime: "18:00",
        location: "Lisbon",
        role: "agent",
      }),
      makeShift({
        parseId: "shift-parse-b-2",
        userId,
        date: "2026-04-11",
        startTime: "09:00",
        endTime: "18:00",
        location: "Porto",
        role: "agent",
      }),
    ];

    const r2 = await service.apply({
      shifts: upload2Same,
      accessToken: "token",
      options,
    });

    expect(r2.summary.created).toBe(0);
    expect(r2.summary.noop).toBe(2);
    expect(adapter.created).toBe(2);
    expect(adapter.eventCount()).toBe(2);

    // Modify one shift time: should update one event, not create duplicate.
    const upload3ModifiedOne = [
      makeShift({
        parseId: "shift-parse-a-3",
        userId,
        date: "2026-04-10",
        startTime: "10:00",
        endTime: "19:00",
        location: "Lisbon",
        role: "agent",
      }),
      makeShift({
        parseId: "shift-parse-b-3",
        userId,
        date: "2026-04-11",
        startTime: "09:00",
        endTime: "18:00",
        location: "Porto",
        role: "agent",
      }),
    ];

    const r3 = await service.apply({
      shifts: upload3ModifiedOne,
      accessToken: "token",
      options,
    });

    expect(r3.summary.updated).toBe(1);
    expect(r3.summary.created).toBe(0);
    expect(adapter.updated).toBe(1);
    expect(adapter.eventCount()).toBe(2);

    // Remove one shift entirely: stale delete should remove one event.
    const upload4RemovedOne = [
      makeShift({
        parseId: "shift-parse-a-4",
        userId,
        date: "2026-04-10",
        startTime: "10:00",
        endTime: "19:00",
        location: "Lisbon",
        role: "agent",
      }),
    ];

    const r4 = await service.apply({
      shifts: upload4RemovedOne,
      accessToken: "token",
      options,
    });

    expect(r4.summary.deleted).toBe(1);
    expect(adapter.deleted).toBe(1);
    expect(adapter.eventCount()).toBe(1);
    expect(r4.errors).toHaveLength(0);

    // Add one new shift: should create exactly one and keep existing unchanged.
    const upload5AddOne = [
      makeShift({
        parseId: "shift-parse-a-5",
        userId,
        date: "2026-04-10",
        startTime: "10:00",
        endTime: "19:00",
        location: "Lisbon",
        role: "agent",
      }),
      makeShift({
        parseId: "shift-parse-c-5",
        userId,
        date: "2026-04-12",
        startTime: "07:00",
        endTime: "16:00",
        location: "Braga",
        role: "agent",
      }),
    ];

    const r5 = await service.apply({
      shifts: upload5AddOne,
      accessToken: "token",
      options,
    });

    expect(r5.summary.created).toBe(1);
    expect(r5.summary.updated).toBe(0);
    expect(r5.summary.deleted).toBe(0);
    expect(adapter.eventCount()).toBe(2);
    expect(r5.errors).toHaveLength(0);
  });

  it("remove whole day in next upload -> deletes stale event for removed date", async () => {
    const userId = "user-2";
    const calendarId = "primary";

    const repo = new InMemoryRecordRepo();
    const adapter = new FakeCalendarAdapter();
    const service = new CalendarSyncService(repo, () => adapter as never);

    const options = {
      userId,
      provider: "google" as const,
      calendarId,
      removeStaleEvents: true,
    };

    const upload1 = [
      makeShift({
        parseId: "u2-a-1",
        userId,
        date: "2026-04-12",
        startTime: "08:00",
        endTime: "17:00",
        location: "Lisbon",
        role: "agent",
      }),
      makeShift({
        parseId: "u2-b-1",
        userId,
        date: "2026-04-13",
        startTime: "08:00",
        endTime: "17:00",
        location: "Porto",
        role: "agent",
      }),
    ];

    const r1 = await service.apply({
      shifts: upload1,
      accessToken: "token",
      options,
    });

    expect(r1.summary.created).toBe(2);
    expect(adapter.eventCount()).toBe(2);

    // Replace schedule where 2026-04-12 is removed entirely.
    const upload2 = [
      makeShift({
        parseId: "u2-b-2",
        userId,
        date: "2026-04-13",
        startTime: "08:00",
        endTime: "17:00",
        location: "Porto",
        role: "agent",
      }),
    ];

    const r2 = await service.apply({
      shifts: upload2,
      accessToken: "token",
      options,
    });

    expect(r2.summary.created).toBe(0);
    expect(r2.summary.deleted).toBe(1);
    expect(r2.summary.noop).toBe(1);
    expect(adapter.deleted).toBe(1);
    expect(adapter.eventCount()).toBe(1);
    expect(r2.errors).toHaveLength(0);
  });

  it("change day and notes for same logical shift -> updates existing event", async () => {
    const userId = "user-3";
    const calendarId = "primary";

    const repo = new InMemoryRecordRepo();
    const adapter = new FakeCalendarAdapter();
    const service = new CalendarSyncService(repo, () => adapter as never);

    const options = {
      userId,
      provider: "google" as const,
      calendarId,
      removeStaleEvents: true,
    };

    const upload1 = [
      makeShift({
        parseId: "u3-a-1",
        userId,
        date: "2026-04-14",
        startTime: "09:00",
        endTime: "18:00",
        location: "Lisbon",
        role: "agent",
      }),
    ];

    const r1 = await service.apply({
      shifts: upload1,
      accessToken: "token",
      options,
    });

    expect(r1.summary.created).toBe(1);
    expect(adapter.eventCount()).toBe(1);
    expect(repo.count()).toBe(1);

    // Same logical shift moved by one day, one hour, and changed notes/role text.
    const upload2 = [
      makeShift({
        parseId: "u3-a-2",
        userId,
        date: "2026-04-15",
        startTime: "10:00",
        endTime: "19:00",
        location: "Lisbon",
        role: "agent lead",
      }),
    ];

    const r2 = await service.apply({
      shifts: upload2,
      accessToken: "token",
      options,
    });

    expect(r2.summary.created).toBe(0);
    expect(r2.summary.updated).toBe(1);
    expect(r2.summary.deleted).toBe(0);
    expect(adapter.created).toBe(1);
    expect(adapter.updated).toBe(1);
    expect(adapter.eventCount()).toBe(1);
    expect(repo.count()).toBe(1);
    expect(r2.errors).toHaveLength(0);
  });

  it("manually deleted google event -> update recovers by recreating and rebinding", async () => {
    const userId = "user-4";
    const calendarId = "primary";

    const repo = new InMemoryRecordRepo();
    const adapter = new FakeCalendarAdapter();
    const service = new CalendarSyncService(repo, () => adapter as never);

    const options = {
      userId,
      provider: "google" as const,
      calendarId,
      removeStaleEvents: true,
    };

    const firstUpload = [
      makeShift({
        parseId: "u4-a-1",
        userId,
        date: "2026-04-18",
        startTime: "09:00",
        endTime: "18:00",
        location: "Lisbon",
        role: "agent",
      }),
    ];

    const first = await service.apply({
      shifts: firstUpload,
      accessToken: "token",
      options,
    });

    expect(first.summary.created).toBe(1);
    expect(first.errors).toHaveLength(0);
    expect(adapter.eventCount()).toBe(1);

    const staleEventId = first.syncedShifts[0]?.googleEventId;
    expect(staleEventId).toBeTruthy();

    await adapter.deleteEvent(calendarId, staleEventId as string);
    expect(adapter.eventCount()).toBe(0);

    const secondUpload = [
      makeShift({
        parseId: "u4-a-2",
        userId,
        date: "2026-04-18",
        startTime: "10:00",
        endTime: "19:00",
        location: "Lisbon",
        role: "agent",
      }),
    ];

    const second = await service.apply({
      shifts: secondUpload,
      accessToken: "token",
      options,
    });

    expect(second.summary.updated).toBe(1);
    expect(second.summary.created).toBe(0);
    expect(second.errors).toHaveLength(0);
    expect(adapter.eventCount()).toBe(1);
    expect(second.syncedShifts[0]?.googleEventId).not.toBe(staleEventId);
  });

  it("manually deleted google events with unchanged shifts -> noop recovery recreates missing events", async () => {
    const userId = "user-5";
    const calendarId = "primary";

    const repo = new InMemoryRecordRepo();
    const adapter = new FakeCalendarAdapter();
    const service = new CalendarSyncService(repo, () => adapter as never);

    const options = {
      userId,
      provider: "google" as const,
      calendarId,
      removeStaleEvents: true,
    };

    const upload = [
      makeShift({
        parseId: "u5-a-1",
        userId,
        date: "2026-04-20",
        startTime: "09:00",
        endTime: "18:00",
        location: "Lisbon",
        role: "agent",
      }),
      makeShift({
        parseId: "u5-b-1",
        userId,
        date: "2026-04-21",
        startTime: "09:00",
        endTime: "18:00",
        location: "Porto",
        role: "agent",
      }),
    ];

    const first = await service.apply({
      shifts: upload,
      accessToken: "token",
      options,
    });

    expect(first.summary.created).toBe(2);
    expect(first.errors).toHaveLength(0);
    expect(adapter.eventCount()).toBe(2);

    const firstEventIds = first.syncedShifts
      .map((shift) => shift.googleEventId)
      .filter((value): value is string => Boolean(value));

    for (const eventId of firstEventIds) {
      await adapter.deleteEvent(calendarId, eventId);
    }

    expect(adapter.eventCount()).toBe(0);

    const second = await service.apply({
      shifts: upload.map((shift, index) => ({
        ...shift,
        id: `u5-repeat-${index}`,
      })),
      accessToken: "token",
      options,
    });

    expect(second.summary.updated).toBe(2);
    expect(second.summary.noop).toBe(0);
    expect(second.errors).toHaveLength(0);
    expect(adapter.eventCount()).toBe(2);
  });
});
