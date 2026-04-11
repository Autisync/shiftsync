import type { ShiftData } from "@/types/shift";
import type {
  CalendarSyncExecutionResult,
  CalendarSyncOptions,
  CalendarSyncPreviewSummary,
} from "@/features/calendar/types";

export class ServerCalendarSyncAdapter {
  async previewSyncShifts(_input: {
    shifts: ShiftData[];
    accessToken: string;
    options: CalendarSyncOptions;
  }): Promise<{ summary: CalendarSyncPreviewSummary }> {
    throw new Error(
      "ServerCalendarSyncAdapter is not implemented yet. Browser Google adapter remains active for Phase 3.",
    );
  }

  async syncPreviewShifts(_input: {
    shifts: ShiftData[];
    accessToken: string;
    options: CalendarSyncOptions;
  }): Promise<CalendarSyncExecutionResult> {
    throw new Error(
      "ServerCalendarSyncAdapter is not implemented yet. Browser Google adapter remains active for Phase 3.",
    );
  }
}
