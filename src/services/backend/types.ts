/**
 * src/services/backend/types.ts
 *
 * Backend-neutral service interfaces for ShiftSync.
 * Both SupabaseProvider and HttpProvider must implement BackendServices.
 */

import type {
  AuthSession,
  UserProfile,
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
  LeaveRequest,
  LeaveRequestStatus,
  ScheduleUpload,
  ScheduleAccessRequest,
  AccessRequestStatus,
  HRSettings,
} from "@/types/domain";

// ── Notification payloads ──────────────────────────────────────────────────

export interface LeaveNotificationPayload {
  leaveRequestId: string;
  userId: string;
  status: LeaveRequestStatus;
  /** Effective start date (approved if set, otherwise requested). */
  startDate: string;
  /** Effective end date (approved if set, otherwise requested). */
  endDate: string;
  type: string;
  notes: string | null;
  updatedAt: string;
}
import type { ShiftData } from "@/types/shift";

// ── AuthService ────────────────────────────────────────────────────────────

export interface AuthService {
  /** Returns the current auth session, or null if unauthenticated. */
  getSession(): Promise<AuthSession | null>;
  /** Initiates Google OAuth sign-in. Returns the redirect URL. */
  signInWithGoogle(): Promise<string>;
  /** Signs out the current user. */
  signOut(): Promise<void>;
  /** Subscribes to auth state changes. Returns an unsubscribe function. */
  onAuthChange(callback: (session: AuthSession | null) => void): () => void;
}

// ── UserService ────────────────────────────────────────────────────────────

export interface UserService {
  /** Returns the profile for the given user ID from public.users. */
  getUserProfile(userId: string): Promise<UserProfile | null>;
  /** Updates mutable user profile fields. */
  updateUserProfile(
    userId: string,
    data: Partial<Pick<UserProfile, "fullName" | "email" | "employeeCode">>,
  ): Promise<UserProfile>;
  getDefaultCalendarPreference(userId: string): Promise<{
    calendarId: string;
    calendarName: string | null;
  } | null>;
  saveDefaultCalendarPreference(
    userId: string,
    input: { calendarId: string; calendarName?: string | null },
  ): Promise<void>;
}

// ── ShiftService ───────────────────────────────────────────────────────────

export interface ShiftService {
  getShiftsForUser(userId: string): Promise<Shift[]>;
  getShiftById(id: string): Promise<Shift | null>;
  createShift(
    data: Omit<Shift, "id" | "createdAt" | "updatedAt">,
  ): Promise<Shift>;
  updateShift(
    id: string,
    data: Partial<Omit<Shift, "id" | "userId" | "createdAt" | "updatedAt">>,
  ): Promise<Shift>;
  deleteShift(id: string): Promise<void>;
  updateGoogleEventId(shiftId: string, googleEventId: string): Promise<void>;
}

// ── UploadService ──────────────────────────────────────────────────────────

export interface UploadService {
  createUpload(
    data: Omit<ScheduleUpload, "id" | "uploadedAt">,
  ): Promise<ScheduleUpload>;
  getUploadById(id: string): Promise<ScheduleUpload | null>;
  getUploadsByUser(userId: string): Promise<ScheduleUpload[]>;
  getAccessRequestsForUpload(
    uploadId: string,
  ): Promise<ScheduleAccessRequest[]>;
  createAccessRequest(
    data: Omit<ScheduleAccessRequest, "id" | "createdAt" | "updatedAt">,
  ): Promise<ScheduleAccessRequest>;
  updateAccessRequest(
    id: string,
    data: Partial<
      Pick<
        ScheduleAccessRequest,
        "consentGiven" | "status" | "reviewedAt" | "reviewedByUserId"
      >
    >,
  ): Promise<ScheduleAccessRequest>;
}

// ── SwapService ────────────────────────────────────────────────────────────

export interface SwapService {
  openAvailability(shiftId: string, userId: string): Promise<SwapAvailability>;
  closeAvailability(shiftId: string): Promise<void>;
  getOpenAvailabilities(): Promise<
    Array<{ shift: Shift; availability: SwapAvailability }>
  >;
  createSwapRequest(data: {
    requesterUserId: string;
    requesterShiftId: string;
    targetUserId: string;
    targetShiftId?: string;
    message?: string;
  }): Promise<SwapRequest>;
  getSwapRequestsForUser(userId: string): Promise<SwapRequest[]>;
  updateSwapStatus(
    id: string,
    status: SwapRequestStatus,
    actorUserId?: string,
    violations?: { code: string; reason: string },
  ): Promise<SwapRequest>;
  acceptSwapRequest(
    requestId: string,
    targetUserId: string,
    validationResult: {
      valid: boolean;
      violations: Array<{ code: string; message: string }>;
    },
  ): Promise<SwapRequest>;
  markHREmailSent(
    requestId: string,
    actorUserId?: string,
  ): Promise<SwapRequest>;
  markHRApproved(requestId: string, actorUserId?: string): Promise<SwapRequest>;
  applySwap(requestId: string): Promise<SwapRequest>;
  getHRSettings(userId: string): Promise<HRSettings | null>;
  saveHRSettings(input: {
    userId: string;
    hrEmail: string;
    ccEmails: string[];
    selectedCalendarId?: string | null;
    selectedCalendarName?: string | null;
    lastSyncedCalendarId?: string | null;
  }): Promise<HRSettings>;
}

// ── LeaveService ───────────────────────────────────────────────────────────

export interface LeaveApproveInput {
  /** HR-confirmed start date. Defaults to requested dates if omitted. */
  approvedStartDate?: string;
  /** HR-confirmed end date. Defaults to requested dates if omitted. */
  approvedEndDate?: string;
  approvedNotes?: string;
  hrResponseNotes?: string;
}

export interface LeaveRejectInput {
  hrResponseNotes?: string;
}

export interface LeaveSendToHRInput {
  /** pre-computed mailto URL string returned to the caller */
  mailtoUrl: string;
}

export interface LeaveSyncResult {
  created: number;
  updated: number;
  googleEventId: string;
  leaveUid: string;
  calendarId: string;
}

export interface LeaveService {
  /** Creates a leave request as a draft (status = draft). */
  createLeaveRequest(
    data: Omit<
      LeaveRequest,
      | "id"
      | "status"
      | "createdAt"
      | "updatedAt"
      | "sentToHrAt"
      | "decisionDueAt"
      | "approvedStartDate"
      | "approvedEndDate"
      | "approvedNotes"
      | "hrResponseNotes"
      | "softDeclinedAt"
      | "calendarAppliedAt"
      | "googleEventId"
      | "leaveUid"
      | "lastSyncedCalendarId"
    >,
  ): Promise<LeaveRequest>;

  getLeaveRequestsForUser(userId: string): Promise<LeaveRequest[]>;

  /** Transitions status → pending and records sent_to_hr_at / decision_due_at. */
  markSentToHR(id: string): Promise<LeaveRequest>;

  /** Transitions pending → approved. Stores approved dates (defaults to requested). */
  approveLeaveRequest(
    id: string,
    input?: LeaveApproveInput,
  ): Promise<LeaveRequest>;

  /** Transitions pending → rejected. */
  rejectLeaveRequest(
    id: string,
    input?: LeaveRejectInput,
  ): Promise<LeaveRequest>;

  /**
   * Updates approved start/end dates on an already-approved férias request.
   * Does NOT change status. Used before calendar sync.
   */
  updateApprovedDates(
    id: string,
    approvedStartDate: string,
    approvedEndDate: string,
  ): Promise<LeaveRequest>;

  /**
   * Records a successful calendar sync (google_event_id, leave_uid,
   * last_synced_calendar_id, calendar_applied_at).
   */
  recordCalendarSync(
    id: string,
    syncData: {
      googleEventId: string;
      leaveUid: string;
      calendarId: string;
    },
  ): Promise<LeaveRequest>;

  /** @deprecated — use approveLeaveRequest / rejectLeaveRequest instead. */
  updateLeaveStatus(
    id: string,
    status: LeaveRequestStatus,
  ): Promise<LeaveRequest>;
}

// ── CalendarSyncService ────────────────────────────────────────────────────

export interface CalendarSyncRunOptions {
  userId: string;
  accessToken: string;
  calendarId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  fullResync?: boolean;
  removeStaleEvents?: boolean;
}

export interface CalendarPreviewSyncResult {
  summary: {
    created: number;
    updated: number;
    deleted: number;
    noop: number;
    failed: number;
  };
  changes?: Array<{
    type: "create" | "update" | "delete" | "noop";
    reason: string;
    syncShiftKey: string | null;
    date: string | null;
    start: string | null;
    end: string | null;
    title: string | null;
    location: string | null;
  }>;
  syncedShifts: ShiftData[];
  errors: Array<{ shiftId: string | null; message: string }>;
}

export interface CalendarPreviewOptions {
  userId: string;
  accessToken: string;
  calendarId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  fullResync?: boolean;
  removeStaleEvents?: boolean;
}

export interface CalendarSyncService {
  syncShifts(
    shifts: Shift[],
    accessToken: string,
    calendarId: string,
  ): Promise<{ created: number; updated: number; deleted: number }>;
  runSync(
    shifts: ShiftData[],
    options: CalendarSyncRunOptions,
  ): Promise<CalendarPreviewSyncResult>;
  previewSync(
    shifts: ShiftData[],
    options: CalendarPreviewOptions,
  ): Promise<{
    summary: CalendarPreviewSyncResult["summary"];
    changes: NonNullable<CalendarPreviewSyncResult["changes"]>;
  }>;
}

// ── NotificationService ────────────────────────────────────────────────────

export interface NotificationService {
  notifyHR(subject: string, body: string): Promise<void>;
  /** Dispatched after a leave request status changes (pending→approved/rejected). */
  notifyLeaveStatusChange(payload: LeaveNotificationPayload): Promise<void>;
}

// ── Aggregated provider contract ───────────────────────────────────────────

export interface BackendServices {
  auth: AuthService;
  users: UserService;
  shifts: ShiftService;
  uploads: UploadService;
  swaps: SwapService;
  leave: LeaveService;
  calendar: CalendarSyncService;
  notifications: NotificationService;
}
