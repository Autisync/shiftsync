/**
 * src/types/domain.ts
 *
 * Backend-neutral domain models for ShiftSync.
 * These are the shapes used by UI components and service interfaces.
 * Raw DB row types (src/types/supabase.ts) must NOT be used directly in UI.
 */

// ── Users ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  employeeCode: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Shifts ─────────────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  userId: string;
  shiftUid?: string | null;
  /** ISO date string, e.g. "2025-04-09" */
  date: string;
  /** ISO datetime string */
  startsAt: string;
  /** ISO datetime string */
  endsAt: string;
  role: string | null;
  location: string | null;
  googleEventId: string | null;
  sourceUploadId: string | null;
  uploadBatchId?: string | null;
  status?: "active" | "deleted" | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Swap availability ──────────────────────────────────────────────────────

export interface SwapAvailability {
  id: string;
  shiftId: string;
  isOpen: boolean;
  openedByUserId: string;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Swap requests ──────────────────────────────────────────────────────────

export type SwapRequestStatus =
  | "pending"
  | "accepted"
  | "submitted_to_hr"
  | "approved"
  | "awaiting_hr_request"
  | "rejected"
  | "ready_to_apply"
  | "applied";

export interface SwapRequestStatusChange {
  status: SwapRequestStatus;
  changedAt: string;
  changedByUserId: string | null;
}

export interface SwapRequest {
  id: string;
  requesterUserId: string;
  targetUserId: string;
  requesterShiftId: string;
  targetShiftId: string | null;
  status: SwapRequestStatus;
  message: string | null;
  statusHistory: SwapRequestStatusChange[];
  pendingAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  submittedToHrAt: string | null;
  approvedAt: string | null;
  requesterHrSent: boolean;
  targetHrSent: boolean;
  requesterHrApproved: boolean;
  targetHrApproved: boolean;
  calendarUpdateEnabled: boolean;
  ruleViolation: string | null;
  violationReason: string | null;
  hrEmailSent: boolean;
  calendarApplied: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── HR Settings ────────────────────────────────────────────────────────────

export interface HRSettings {
  id: string;
  userId: string;
  hrEmail: string;
  ccEmails: string[];
  selectedCalendarId: string | null;
  selectedCalendarName: string | null;
  lastSyncedCalendarId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Leave requests ─────────────────────────────────────────────────────────

export type LeaveRequestStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "soft_declined";

export interface LeaveRequest {
  id: string;
  userId: string;
  type: string;
  /** ISO date string — as originally requested by the user. */
  startDate: string;
  /** ISO date string — as originally requested by the user. */
  endDate: string;
  notes: string | null;
  status: LeaveRequestStatus;
  /** When the HR email was dispatched (status transitions to pending). */
  sentToHrAt: string | null;
  /** sent_to_hr_at + 30 days; request becomes soft_declined if still pending. */
  decisionDueAt: string | null;
  /** HR-confirmed start date — may differ from requested. Defaults to startDate if null. */
  approvedStartDate: string | null;
  /** HR-confirmed end date — may differ from requested. Defaults to endDate if null. */
  approvedEndDate: string | null;
  approvedNotes: string | null;
  hrResponseNotes: string | null;
  softDeclinedAt: string | null;
  /** When the approved dates were last written to the user's calendar. */
  calendarAppliedAt: string | null;
  /** Google Calendar event id for the leave event (null until first sync). */
  googleEventId: string | null;
  /**
   * Deterministic hash: SHA-256(userId|type|approvedStart|approvedEnd).
   * Used to detect approved-date changes and avoid duplicate calendar events.
   */
  leaveUid: string | null;
  /** Calendar id that was last synced. */
  lastSyncedCalendarId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Schedule uploads ───────────────────────────────────────────────────────

export interface ScheduleUpload {
  id: string;
  uploaderUserId: string;
  fileHash: string;
  consentToShare: boolean;
  metadata: Record<string, unknown>;
  uploadedAt: string;
}

// ── Schedule access requests ───────────────────────────────────────────────

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface ScheduleAccessRequest {
  id: string;
  requesterUserId: string;
  scheduleUploadId: string;
  consentGiven: boolean;
  status: AccessRequestStatus;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Auth session ───────────────────────────────────────────────────────────

export interface AuthSession {
  userId: string;
  email: string;
  /** OAuth provider access token (e.g. Google Calendar token) */
  providerToken: string | null;
}
