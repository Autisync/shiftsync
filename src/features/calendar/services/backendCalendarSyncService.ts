import { CalendarSyncService as Phase3CalendarSync } from "@/features/calendar/services/calendarSyncService";
import { GoogleCalendarAdapter } from "@/features/calendar/services/googleCalendarAdapter";
import type { CalendarProviderAdapter } from "@/features/calendar/services/googleCalendarAdapter";
import type {
  CalendarDateRange,
  CalendarSyncExecutionResult,
  CalendarSyncPreviewResult,
  CalendarSyncRecordRepository,
} from "@/features/calendar/types";
import type { ShiftData } from "@/types/shift";

export type ExternalCalendarProvider = "google";

export interface ExternalCalendarConnection {
  id: string;
  userId: string;
  provider: ExternalCalendarProvider;
  googleEmail: string | null;
  defaultCalendarId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface CalendarConnectionStore {
  getConnection(input: {
    userId: string;
    provider: ExternalCalendarProvider;
  }): Promise<ExternalCalendarConnection | null>;
  updateConnectionSyncAudit(input: {
    connectionId: string;
    lastSyncedAt: string | null;
    lastSyncStatus: "ok" | "failed";
    lastSyncError: string | null;
  }): Promise<void>;
}

export interface CalendarShiftStore {
  listShiftsForRange(input: {
    userId: string;
    range: CalendarDateRange;
  }): Promise<ShiftData[]>;
  persistGoogleSyncProjection(input: {
    userId: string;
    shifts: ShiftData[];
    source: "app" | "google" | "system";
  }): Promise<void>;
}

export interface CalendarTokenManager {
  getValidAccessToken(input: {
    connection: ExternalCalendarConnection;
  }): Promise<{
    accessToken: string;
    expiresAt: string | null;
  }>;
}

function toHHmm(value: string): string {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function withShiftDateTime(input: {
  date: Date;
  time: string;
}): string {
  const dt = new Date(input.date);
  const [h, m] = input.time.split(":").map(Number);
  dt.setHours(h || 0, m || 0, 0, 0);
  return dt.toISOString();
}

function isSameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

function resolveRange(shifts: ShiftData[], fallbackDays = 45): CalendarDateRange {
  if (shifts.length === 0) {
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 14);
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + fallbackDays);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  const timestamps = shifts.map((shift) => shift.date.getTime());
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const start = new Date(minTs);
  start.setUTCDate(start.getUTCDate() - 2);
  const end = new Date(maxTs);
  end.setUTCDate(end.getUTCDate() + 2);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function reconcileGoogleManagedFields(input: {
  shifts: ShiftData[];
  eventsById: Map<
    string,
    {
      id: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      location?: string;
    }
  >;
}): { shifts: ShiftData[]; updatedFromGoogle: number } {
  let updatedFromGoogle = 0;

  const shifts = input.shifts.map((shift) => {
    if (!shift.googleEventId) {
      return shift;
    }

    const event = input.eventsById.get(shift.googleEventId);
    if (!event) {
      // Linked event disappeared from Google; clear linkage but keep business data.
      updatedFromGoogle += 1;
      return {
        ...shift,
        googleEventId: undefined,
        status: shift.status === "deleted" ? "deleted" : "modified",
      };
    }

    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (!start || !end) {
      return shift;
    }

    const nextShift: ShiftData = {
      ...shift,
      date: new Date(start),
      startTime: toHHmm(start),
      endTime: toHHmm(end),
      location: event.location ?? shift.location,
      status: shift.status === "deleted" ? "deleted" : "modified",
    };

    const changed =
      !isSameInstant(withShiftDateTime({ date: shift.date, time: shift.startTime }), start) ||
      !isSameInstant(withShiftDateTime({ date: shift.date, time: shift.endTime }), end) ||
      (shift.location ?? "") !== (nextShift.location ?? "");

    if (changed) {
      updatedFromGoogle += 1;
      return nextShift;
    }

    return shift;
  });

  return { shifts, updatedFromGoogle };
}

export class BackendCalendarSyncService {
  constructor(
    private readonly records: CalendarSyncRecordRepository,
    private readonly connections: CalendarConnectionStore,
    private readonly shifts: CalendarShiftStore,
    private readonly tokenManager: CalendarTokenManager,
    private readonly adapterFactory: (
      accessToken: string,
    ) => CalendarProviderAdapter = (accessToken) =>
      new GoogleCalendarAdapter(accessToken),
  ) {}

  private async resolveRuntime(input: {
    userId: string;
    calendarId: string;
    dateRange?: CalendarDateRange;
  }): Promise<{
    connection: ExternalCalendarConnection;
    accessToken: string;
    shifts: ShiftData[];
    range: CalendarDateRange;
  }> {
    const connection = await this.connections.getConnection({
      userId: input.userId,
      provider: "google",
    });

    if (!connection || !connection.syncEnabled) {
      throw new Error("Google Calendar sync connection is missing or disabled.");
    }

    const token = await this.tokenManager.getValidAccessToken({ connection });
    const range = input.dateRange ?? resolveRange([]);

    const shifts = await this.shifts.listShiftsForRange({
      userId: input.userId,
      range,
    });

    const resolvedRange = input.dateRange ?? resolveRange(shifts);

    return {
      connection,
      accessToken: token.accessToken,
      shifts,
      range: resolvedRange,
    };
  }

  async preview(input: {
    userId: string;
    calendarId: string;
    dateRange?: CalendarDateRange;
    fullResync?: boolean;
    removeStaleEvents?: boolean;
  }): Promise<CalendarSyncPreviewResult> {
    const runtime = await this.resolveRuntime(input);
    const core = new Phase3CalendarSync(this.records, this.adapterFactory);

    console.info("[CalendarSync][Backend] preview start", {
      user_id: input.userId,
      calendar_id: input.calendarId,
      range: runtime.range,
      shift_count: runtime.shifts.length,
    });

    const preview = await core.preview({
      shifts: runtime.shifts,
      accessToken: runtime.accessToken,
      options: {
        userId: input.userId,
        provider: "google",
        calendarId: input.calendarId,
        dateRange: runtime.range,
        fullResync: input.fullResync,
        removeStaleEvents: input.removeStaleEvents ?? true,
        // We do explicit Google->DB reconciliation in apply(); preview is DB-driven.
        preferPlatformChanges: true,
      },
    });

    return preview;
  }

  async apply(input: {
    userId: string;
    calendarId: string;
    dateRange?: CalendarDateRange;
    fullResync?: boolean;
    removeStaleEvents?: boolean;
  }): Promise<CalendarSyncExecutionResult> {
    const startedAt = new Date().toISOString();
    const connection = await this.connections.getConnection({
      userId: input.userId,
      provider: "google",
    });

    if (!connection || !connection.syncEnabled) {
      throw new Error("Google Calendar sync connection is missing or disabled.");
    }

    try {
      const token = await this.tokenManager.getValidAccessToken({ connection });
      const range = input.dateRange ?? resolveRange([]);
      const runtimeShifts = await this.shifts.listShiftsForRange({
        userId: input.userId,
        range,
      });
      const resolvedRange = input.dateRange ?? resolveRange(runtimeShifts);

      const adapter = this.adapterFactory(token.accessToken);
      const core = new Phase3CalendarSync(this.records, this.adapterFactory);

      console.info("[CalendarSync][Backend] apply start", {
        user_id: input.userId,
        calendar_id: input.calendarId,
        range: resolvedRange,
        shift_count: runtimeShifts.length,
      });

      let shiftsForApply = runtimeShifts;
      let updatedFromGoogle = 0;

      if (adapter.listEvents) {
        const events = await adapter.listEvents(input.calendarId, {
          timeMin: `${resolvedRange.start}T00:00:00Z`,
          timeMax: `${resolvedRange.end}T23:59:59Z`,
        });

        const reconciled = reconcileGoogleManagedFields({
          shifts: runtimeShifts,
          eventsById: new Map(events.map((event) => [event.id, event])),
        });

        shiftsForApply = reconciled.shifts;
        updatedFromGoogle = reconciled.updatedFromGoogle;

        if (updatedFromGoogle > 0) {
          await this.shifts.persistGoogleSyncProjection({
            userId: input.userId,
            shifts: shiftsForApply,
            source: "google",
          });
        }

        console.info("[CalendarSync][GooglePull] reconcile complete", {
          user_id: input.userId,
          calendar_id: input.calendarId,
          updated_from_google: updatedFromGoogle,
        });
      }

      let result: CalendarSyncExecutionResult;
      result = await core.apply({
        shifts: shiftsForApply,
        accessToken: token.accessToken,
        options: {
          userId: input.userId,
          provider: "google",
          calendarId: input.calendarId,
          dateRange: resolvedRange,
          fullResync: input.fullResync,
          removeStaleEvents: input.removeStaleEvents ?? true,
          // Google pull was already done explicitly and safely above.
          preferPlatformChanges: true,
        },
      });

      result.summary.updatedFromGoogle = updatedFromGoogle;

      await this.shifts.persistGoogleSyncProjection({
        userId: input.userId,
        shifts: result.syncedShifts,
        source: "system",
      });

      await this.connections.updateConnectionSyncAudit({
        connectionId: connection.id,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "ok",
        lastSyncError: null,
      });

      console.info("[CalendarSync][GooglePush] apply complete", {
        user_id: input.userId,
        calendar_id: input.calendarId,
        range: resolvedRange,
        created: result.summary.created,
        updated: result.summary.updated,
        deleted: result.summary.deleted,
        noop: result.summary.noop,
        updated_from_google: result.summary.updatedFromGoogle,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.connections.updateConnectionSyncAudit({
        connectionId: connection.id,
        lastSyncedAt: startedAt,
        lastSyncStatus: "failed",
        lastSyncError: message,
      });

      console.error("[CalendarSync][Backend] apply failed", {
        user_id: input.userId,
        calendar_id: input.calendarId,
        range: input.dateRange ?? null,
        error: message,
      });
      throw error;
    }
  }
}
