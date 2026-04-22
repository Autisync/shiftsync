/**
 * src/services/contracts/calendar.dto.ts
 *
 * Data-transfer objects for CalendarSyncService operations.
 */

import type { ShiftData } from "@/types/shift";

/**
 * Options for a full or partial calendar sync run.
 */
export interface CalendarSyncRunOptions {
  userId: string;
  accessToken?: string;
  calendarId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  fullResync?: boolean;
  removeStaleEvents?: boolean;
  preferPlatformChanges?: boolean;
}

/**
 * A single change item within a calendar sync preview.
 */
export interface CalendarSyncChangeItem {
  type: "create" | "update" | "delete" | "noop";
  reason: string;
  syncShiftKey: string | null;
  date: string | null;
  start: string | null;
  end: string | null;
  title: string | null;
  location: string | null;
}

/**
 * Summary counters for any calendar sync operation.
 */
export interface CalendarSyncSummary {
  created: number;
  updated: number;
  deleted: number;
  noop: number;
  failed: number;
  updatedFromGoogle: number;
}

/**
 * Full result of a calendar sync run, including per-shift outcomes.
 */
export interface CalendarSyncResult {
  summary: CalendarSyncSummary;
  changes?: CalendarSyncChangeItem[];
  syncedShifts: ShiftData[];
  errors: Array<{ shiftId: string | null; message: string }>;
}

/**
 * Options for a dry-run calendar preview (no writes).
 */
export interface CalendarPreviewOptions {
  userId: string;
  accessToken?: string;
  calendarId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  fullResync?: boolean;
  removeStaleEvents?: boolean;
  preferPlatformChanges?: boolean;
}

/**
 * Dry-run preview result — summary + detailed change list, no side effects.
 */
export interface CalendarPreviewResult {
  summary: CalendarSyncSummary;
  changes: CalendarSyncChangeItem[];
}

export interface CalendarConnectionStatus {
  connected: boolean;
  provider: "google";
  googleEmail: string | null;
  defaultCalendarId: string | null;
  syncEnabled: boolean;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface ConnectGoogleCalendarInput {
  code: string;
  redirectUri: string;
  defaultCalendarId?: string | null;
}

export interface UpdateCalendarConnectionInput {
  defaultCalendarId?: string | null;
  syncEnabled?: boolean;
}

export interface TriggerCalendarSyncInput {
  userId: string;
  calendarId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  fullResync?: boolean;
}
