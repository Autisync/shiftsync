import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftData, CalendarEvent } from "../../src/types/shift";
import type {
  CalendarSyncRecord,
  CalendarSyncRecordRepository,
} from "../../src/features/calendar/types";
import { BackendCalendarSyncService } from "../../src/features/calendar/services/backendCalendarSyncService";

class InMemoryRecordRepo implements CalendarSyncRecordRepository {
  private byId = new Map<string, CalendarSyncRecord>();
  private bySyncKey = new Map<string, string>();

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

  async getRecordsBySyncKeys(input: {
    userId: string;
    provider: "google";
    calendarId: string;
    syncShiftKeys: string[];
  }): Promise<CalendarSyncRecord[]> {
    const keys = new Set(input.syncShiftKeys);
    return [...this.byId.values()].filter((record) => {
      return (
        record.userId === input.userId &&
        record.provider === input.provider &&
        record.calendarId === input.calendarId &&
        keys.has(record.syncShiftKey)
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
    const id = this.bySyncKey.get(input.syncShiftKey) ?? `rec-${this.byId.size + 1}`;

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
  }

  async deleteRecord(recordId: string): Promise<void> {
    const existing = this.byId.get(recordId);
    if (!existing) return;
    this.byId.delete(recordId);
    this.bySyncKey.delete(existing.syncShiftKey);
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
}

class FakeAdapter {
  private events = new Map<string, CalendarEvent>();
  private next = 1;

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

  async listEvents(
    _calendarId: string,
    _input: { timeMin: string; timeMax: string },
  ): Promise<CalendarEvent[]> {
    return [...this.events.values()];
  }

  async createEvent(
    _calendarId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent> {
    this.created += 1;
    const id = `evt-${this.next++}`;
    const event: CalendarEvent = {
      id,
      summary: "Shift",
      start: { dateTime: toIso(shift.date, shift.startTime), timeZone: "Europe/Lisbon" },
      end: { dateTime: toIso(shift.date, shift.endTime), timeZone: "Europe/Lisbon" },
      description: "",
      location: shift.location ?? undefined,
    } as CalendarEvent & { location?: string };
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

    const next: CalendarEvent = {
      ...existing,
      start: { ...existing.start, dateTime: toIso(shift.date, shift.startTime) },
      end: { ...existing.end, dateTime: toIso(shift.date, shift.endTime) },
      location: shift.location ?? undefined,
    } as CalendarEvent & { location?: string };
    this.events.set(eventId, next);
    return next;
  }

  async deleteEvent(_calendarId: string, eventId: string): Promise<void> {
    if (this.events.has(eventId)) {
      this.deleted += 1;
      this.events.delete(eventId);
    }
  }

  seedEvent(event: CalendarEvent): void {
    this.events.set(event.id, event);
  }
}

function toIso(date: Date, time: string): string {
  const dt = new Date(date);
  const [h, m] = time.split(":").map(Number);
  dt.setHours(h, m, 0, 0);
  return dt.toISOString();
}

function shift(input: Partial<ShiftData> = {}): ShiftData {
  return {
    id: input.id ?? "shift-1",
    shiftUid: input.shiftUid ?? "uid-1",
    week: 1,
    date: input.date ?? new Date("2026-04-24T00:00:00.000Z"),
    startTime: input.startTime ?? "09:00",
    endTime: input.endTime ?? "18:00",
    shiftType: "morning",
    status: input.status ?? "active",
    location: input.location ?? "Lisbon",
    googleEventId: input.googleEventId,
  };
}

describe("BackendCalendarSyncService", () => {
  let repo: InMemoryRecordRepo;
  let adapter: FakeAdapter;
  let persisted: Array<{ source: "app" | "google" | "system"; shifts: ShiftData[] }>;
  let tokenFails = false;
  const auditSpy = vi.fn();

  beforeEach(() => {
    repo = new InMemoryRecordRepo();
    adapter = new FakeAdapter();
    persisted = [];
    tokenFails = false;
    auditSpy.mockReset();
  });

  function buildService(seedShifts: ShiftData[]): BackendCalendarSyncService {
    return new BackendCalendarSyncService(
      repo,
      {
        getConnection: async () => ({
          id: "conn-1",
          userId: "user-1",
          provider: "google",
          googleEmail: "user@example.com",
          defaultCalendarId: "primary",
          accessToken: "access",
          refreshToken: "refresh",
          tokenExpiresAt: null,
          syncEnabled: true,
          lastSyncedAt: null,
          lastSyncStatus: null,
          lastSyncError: null,
        }),
        updateConnectionSyncAudit: auditSpy,
      },
      {
        listShiftsForRange: async () => seedShifts,
        persistGoogleSyncProjection: async ({ source, shifts }) => {
          persisted.push({ source, shifts: shifts.map((s) => ({ ...s })) });
        },
      },
      {
        getValidAccessToken: async () => {
          if (tokenFails) {
            throw new Error("token refresh failed");
          }
          return { accessToken: "access", expiresAt: null };
        },
      },
      () => adapter as never,
    );
  }

  it("app to Google creates event and persists linkage", async () => {
    const service = buildService([shift()]);

    const result = await service.apply({
      userId: "user-1",
      calendarId: "primary",
    });

    expect(result.summary.created).toBe(1);
    expect(adapter.created).toBe(1);
    expect(persisted.some((entry) => entry.source === "system")).toBe(true);
  });

  it("Google to DB reconciliation updates safe fields", async () => {
    const seededShift = shift({ googleEventId: "evt-1", startTime: "09:00", endTime: "18:00", location: "Lisbon" });
    adapter.seedEvent({
      id: "evt-1",
      summary: "Shift",
      start: { dateTime: toIso(seededShift.date, "10:00"), timeZone: "Europe/Lisbon" },
      end: { dateTime: toIso(seededShift.date, "19:00"), timeZone: "Europe/Lisbon" },
      description: "",
      location: "Porto",
    } as CalendarEvent & { location?: string });

    const service = buildService([seededShift]);

    const result = await service.apply({
      userId: "user-1",
      calendarId: "primary",
    });

    expect(result.summary.updatedFromGoogle).toBe(1);
    const googlePersist = persisted.find((entry) => entry.source === "google");
    expect(googlePersist).toBeTruthy();
    expect(googlePersist?.shifts[0].startTime).toBe("10:00");
    expect(googlePersist?.shifts[0].endTime).toBe("19:00");
    expect(googlePersist?.shifts[0].location).toBe("Porto");
  });

  it("deleted remotely clears linked event without crashing", async () => {
    const service = buildService([shift({ googleEventId: "missing-evt" })]);

    const result = await service.apply({
      userId: "user-1",
      calendarId: "primary",
    });

    expect(result.summary.updatedFromGoogle).toBe(1);
    const googlePersist = persisted.find((entry) => entry.source === "google");
    expect(googlePersist?.shifts[0].googleEventId).toBeUndefined();
  });

  it("prevents duplicate creates across repeated sync runs", async () => {
    const service = buildService([shift()]);

    const first = await service.apply({ userId: "user-1", calendarId: "primary" });
    const second = await service.apply({ userId: "user-1", calendarId: "primary" });

    expect(first.summary.created).toBe(1);
    expect(second.summary.created).toBe(0);
    expect(adapter.created).toBe(1);
  });

  it("records failed audit on token refresh failure", async () => {
    tokenFails = true;
    const service = buildService([shift()]);

    await expect(
      service.apply({ userId: "user-1", calendarId: "primary" }),
    ).rejects.toThrow("token refresh failed");

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        lastSyncStatus: "failed",
      }),
    );
  });
});
