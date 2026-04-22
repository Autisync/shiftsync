import type { ShiftData } from "@/types/shift";
import { getSupabaseClient } from "@/lib/supabase-client";
import type {
  CalendarSyncExecutionResult,
  CalendarSyncOptions,
  CalendarSyncPreviewSummary,
  CalendarSyncPreviewChange,
} from "@/features/calendar/types";

export class ServerCalendarSyncAdapter {
  async previewSyncShifts(input: {
    shifts: ShiftData[];
    accessToken: string;
    options: CalendarSyncOptions;
  }): Promise<{ summary: CalendarSyncPreviewSummary }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable for server calendar preview.");
    }

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "preview",
        userId: input.options.userId,
        calendarId: input.options.calendarId,
        dateRange: input.options.dateRange,
        fullResync: input.options.fullResync,
        removeStaleEvents: input.options.removeStaleEvents,
        shifts: input.shifts,
      },
    });

    if (error) {
      throw new Error(error.message || "Calendar preview failed on backend.");
    }

    const payload =
      (data as {
        summary?: CalendarSyncPreviewSummary;
        changes?: CalendarSyncPreviewChange[];
      } | null) ?? null;

    if (!payload?.summary) {
      throw new Error("Calendar preview backend returned no summary.");
    }

    return { summary: payload.summary };
  }

  async syncPreviewShifts(input: {
    shifts: ShiftData[];
    accessToken: string;
    options: CalendarSyncOptions;
  }): Promise<CalendarSyncExecutionResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable for server calendar sync.");
    }

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "apply",
        userId: input.options.userId,
        calendarId: input.options.calendarId,
        dateRange: input.options.dateRange,
        fullResync: input.options.fullResync,
        removeStaleEvents: input.options.removeStaleEvents,
        shifts: input.shifts,
      },
    });

    if (error) {
      throw new Error(error.message || "Calendar sync failed on backend.");
    }

    const payload = data as CalendarSyncExecutionResult | null;
    if (!payload?.summary || !Array.isArray(payload.syncedShifts)) {
      throw new Error("Calendar sync backend returned an invalid payload.");
    }

    return payload;
  }
}
