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
  | "rejected"
  | "submitted_to_hr"
  | "approved";

export interface SwapRequest {
  id: string;
  requesterUserId: string;
  targetUserId: string;
  requesterShiftId: string;
  targetShiftId: string | null;
  status: SwapRequestStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Leave requests ─────────────────────────────────────────────────────────

export type LeaveRequestStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: string;
  status: LeaveRequestStatus;
  notes: string | null;
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
