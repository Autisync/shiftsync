import type { ShiftData } from "@/types/shift";

export type CalendarProvider = "google";

export interface CalendarDateRange {
  start: string;
  end: string;
}

export interface CalendarSyncOptions {
  userId: string;
  provider: CalendarProvider;
  calendarId: string;
  fullResync?: boolean;
  removeStaleEvents?: boolean;
  dateRange?: CalendarDateRange;
}

export interface CalendarSyncPreviewSummary {
  created: number;
  updated: number;
  deleted: number;
  noop: number;
  failed: number;
}

export interface CalendarSyncPreviewChange {
  type: CalendarDiffActionType;
  reason: string;
  syncShiftKey: string | null;
  date: string | null;
  start: string | null;
  end: string | null;
  title: string | null;
  location: string | null;
}

export interface CalendarSyncPreviewResult {
  summary: CalendarSyncPreviewSummary;
  changes: CalendarSyncPreviewChange[];
}

export type CalendarDiffActionType = "create" | "update" | "delete" | "noop";

export interface CalendarSyncRecord {
  id: string;
  userId: string;
  provider: CalendarProvider;
  calendarId: string;
  shiftId: string | null;
  syncShiftKey: string;
  externalEventId: string;
  shiftFingerprint: string;
  syncedStart: string;
  syncedEnd: string;
  syncedTitle: string;
  syncedDescription: string | null;
  syncedLocation: string | null;
  lastSyncedAt: string;
  syncStatus: "ok" | "failed";
  lastError: string | null;
}

export interface PreparedShiftEvent {
  shift: ShiftData;
  shiftId: string | null;
  syncShiftKey: string;
  fingerprint: string;
  start: string;
  end: string;
  title: string;
  description: string;
  location: string;
}

export interface CalendarDiffAction {
  type: CalendarDiffActionType;
  preparedShift: PreparedShiftEvent | null;
  record: CalendarSyncRecord | null;
  reason: string;
}

export interface CalendarDiffPlan {
  actions: CalendarDiffAction[];
  summary: CalendarSyncPreviewSummary;
}

export interface CalendarSyncItemError {
  action: CalendarDiffActionType;
  reason: string;
  message: string;
  shiftId: string | null;
  externalEventId: string | null;
}

export interface CalendarSyncExecutionResult {
  summary: CalendarSyncPreviewSummary;
  syncedShifts: ShiftData[];
  errors: CalendarSyncItemError[];
  changes: CalendarSyncPreviewChange[];
}

export interface CalendarSyncRecordRepository {
  getRecordsForRange(input: {
    userId: string;
    provider: CalendarProvider;
    calendarId: string;
    range: CalendarDateRange;
  }): Promise<CalendarSyncRecord[]>;
  getRecordsBySyncKeys(input: {
    userId: string;
    provider: CalendarProvider;
    calendarId: string;
    syncShiftKeys: string[];
  }): Promise<CalendarSyncRecord[]>;
  upsertRecord(input: {
    userId: string;
    provider: CalendarProvider;
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
  }): Promise<void>;
  deleteRecord(recordId: string): Promise<void>;
  markFailed(recordId: string, message: string): Promise<void>;
}
