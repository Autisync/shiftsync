/**
 * src/services/backend/types.ts
 *
 * Backend-neutral service interfaces for ShiftSync.
 * Both SupabaseProvider and HttpProvider must implement BackendServices.
 *
 * Inline DTOs have been extracted to src/services/contracts/.
 * This file re-exports them for backward compatibility.
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
  HRSettings,
  AppNotification,
  LeaveRequestAttachment,
  PaginatedQuery,
  PaginatedResult,
  ReminderJob,
  SyncSession,
  UploadTrustAssessment,
  WorkflowActionToken,
} from "@/types/domain";
import type { ShiftData } from "@/types/shift";

import type {
  CalendarPreferenceDTO,
  SaveCalendarPreferenceInput,
} from "@/services/contracts/users.dto";
import type {
  CreateShiftInput,
  UpdateShiftInput,
} from "@/services/contracts/shifts.dto";
import type {
  CreateUploadInput,
  StartUploadSyncInput,
  CreateAccessRequestInput,
  UpdateAccessRequestInput,
} from "@/services/contracts/uploads.dto";
import type {
  CreateSwapRequestInput,
  AcceptSwapValidationInput,
  SwapViolationInput,
  CreateSwapHrLinksInput,
  SwapHrDecisionLinksResult,
  ProcessSwapHrDecisionInput,
  SaveHRSettingsInput,
} from "@/services/contracts/swaps.dto";
import type {
  CreateLeaveRequestInput,
  CreateLeaveEmailPreviewInput,
  CreateLeaveDecisionLinksInput,
  LeaveDecisionLinksResult,
  ProcessLeaveDecisionInput,
  ConfirmLeaveSubmissionInput,
  LeaveApproveInput,
  LeaveRejectInput,
  LeaveCalendarSyncInput,
} from "@/services/contracts/leave.dto";
import type { EmailPreviewPayload } from "@/services/contracts/common.dto";
import type {
  CalendarSyncRunOptions,
  CalendarSyncResult,
  CalendarPreviewOptions,
  CalendarPreviewResult,
} from "@/services/contracts/calendar.dto";
import type { LeaveNotificationPayload } from "@/services/contracts/notifications.dto";
import type {
  WorkflowActionValidationResult,
  CreateActionTokenInput,
  ConsumeActionTokenInput,
} from "@/services/contracts/workflow.dto";
import type { CreateReminderInput } from "@/services/contracts/reminders.dto";

// ── Contract DTOs (re-exported for backward compatibility) ─────────────────

export type {
  FileAttachmentInput,
  FileAttachmentInfo,
  EmailPreviewPayload,
} from "@/services/contracts/common.dto";

export type {
  CalendarPreferenceDTO,
  SaveCalendarPreferenceInput,
  UpdateUserProfileInput,
} from "@/services/contracts/users.dto";

export type {
  CreateShiftInput,
  UpdateShiftInput,
} from "@/services/contracts/shifts.dto";

export type {
  CreateSwapRequestInput,
  SwapViolationInput,
  AcceptSwapValidationInput,
  CreateSwapHrLinksInput,
  SwapHrDecisionLinksResult,
  ProcessSwapHrDecisionInput,
  SaveHRSettingsInput,
} from "@/services/contracts/swaps.dto";

export type {
  CreateLeaveRequestInput,
  CreateLeaveEmailPreviewInput,
  CreateLeaveDecisionLinksInput,
  LeaveDecisionLinksResult,
  ProcessLeaveDecisionInput,
  ConfirmLeaveSubmissionInput,
  LeaveApproveInput,
  LeaveRejectInput,
  LeaveCalendarSyncInput,
  LeaveSyncResult,
} from "@/services/contracts/leave.dto";

export type {
  CreateUploadInput,
  StartUploadSyncInput,
  CreateAccessRequestInput,
  UpdateAccessRequestInput,
} from "@/services/contracts/uploads.dto";

export type {
  CalendarSyncRunOptions,
  CalendarSyncChangeItem,
  CalendarSyncSummary,
  CalendarSyncResult,
  CalendarPreviewOptions,
  CalendarPreviewResult,
} from "@/services/contracts/calendar.dto";

export type { LeaveNotificationPayload } from "@/services/contracts/notifications.dto";

export type {
  WorkflowActionValidationResult,
  CreateActionTokenInput,
  ConsumeActionTokenInput,
} from "@/services/contracts/workflow.dto";

export type { CreateReminderInput } from "@/services/contracts/reminders.dto";

// ── Local-only types ───────────────────────────────────────────────────────

/** @deprecated mailtoUrl is built client-side; no server round-trip needed. */
export interface LeaveSendToHRInput {
  mailtoUrl: string;
}

/**
 * Backward-compat alias for StartUploadSyncInput.
 * @deprecated Use StartUploadSyncInput from "@/services/contracts/uploads.dto"
 */
export type UploadSelectionSyncInput = StartUploadSyncInput;

/**
 * Backward-compat alias for CalendarSyncResult.
 * @deprecated Use CalendarSyncResult from "@/services/contracts/calendar.dto"
 */
export type CalendarPreviewSyncResult = CalendarSyncResult;

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
  getDefaultCalendarPreference(
    userId: string,
  ): Promise<CalendarPreferenceDTO | null>;
  saveDefaultCalendarPreference(
    userId: string,
    input: SaveCalendarPreferenceInput,
  ): Promise<void>;
}

// ── ShiftService ───────────────────────────────────────────────────────────

export interface ShiftService {
  getShiftsForUser(userId: string): Promise<Shift[]>;
  getShiftById(id: string): Promise<Shift | null>;
  createShift(data: CreateShiftInput): Promise<Shift>;
  updateShift(id: string, data: UpdateShiftInput): Promise<Shift>;
  deleteShift(id: string): Promise<void>;
  updateGoogleEventId(shiftId: string, googleEventId: string): Promise<void>;
}

// ── UploadService ──────────────────────────────────────────────────────────

export interface UploadService {
  createUpload(data: CreateUploadInput): Promise<ScheduleUpload>;
  getUploadById(id: string): Promise<ScheduleUpload | null>;
  getUploadsByUser(userId: string): Promise<ScheduleUpload[]>;
  getUploadsByUserPaginated(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<ScheduleUpload>>;
  getUploadTrustAssessments(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<UploadTrustAssessment>>;
  getUploadTrustAssessmentByUpload(
    uploadId: string,
  ): Promise<UploadTrustAssessment | null>;
  startUploadSelectionSync(input: StartUploadSyncInput): Promise<SyncSession>;
  getAccessRequestsForUpload(
    uploadId: string,
  ): Promise<ScheduleAccessRequest[]>;
  createAccessRequest(
    data: CreateAccessRequestInput,
  ): Promise<ScheduleAccessRequest>;
  updateAccessRequest(
    id: string,
    data: UpdateAccessRequestInput,
  ): Promise<ScheduleAccessRequest>;
}

// ── SwapService ────────────────────────────────────────────────────────────

export interface SwapService {
  openAvailability(shiftId: string, userId: string): Promise<SwapAvailability>;
  closeAvailability(shiftId: string): Promise<void>;
  getOpenAvailabilities(): Promise<
    Array<{ shift: Shift; availability: SwapAvailability }>
  >;
  createSwapRequest(data: CreateSwapRequestInput): Promise<SwapRequest>;
  getSwapRequestsForUser(userId: string): Promise<SwapRequest[]>;
  getSwapRequestsForUserPaginated(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<SwapRequest>>;
  updateSwapStatus(
    id: string,
    status: SwapRequestStatus,
    actorUserId?: string,
    violations?: SwapViolationInput,
  ): Promise<SwapRequest>;
  acceptSwapRequest(
    requestId: string,
    targetUserId: string,
    validationResult: AcceptSwapValidationInput,
  ): Promise<SwapRequest>;
  markHREmailSent(
    requestId: string,
    actorUserId?: string,
  ): Promise<SwapRequest>;
  markHRApproved(requestId: string, actorUserId?: string): Promise<SwapRequest>;
  createHrDecisionLinks(
    input: CreateSwapHrLinksInput,
  ): Promise<SwapHrDecisionLinksResult>;
  processHrDecisionAction(
    input: ProcessSwapHrDecisionInput,
  ): Promise<SwapRequest>;
  applySwap(requestId: string): Promise<SwapRequest>;
  getHRSettings(userId: string): Promise<HRSettings | null>;
  saveHRSettings(input: SaveHRSettingsInput): Promise<HRSettings>;
}

// ── LeaveService ───────────────────────────────────────────────────────────

export interface LeaveService {
  /** Creates a leave request as a draft (status = draft). */
  createLeaveRequest(data: CreateLeaveRequestInput): Promise<LeaveRequest>;

  getLeaveRequestsForUser(userId: string): Promise<LeaveRequest[]>;
  getLeaveRequestsForUserPaginated(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<LeaveRequest>>;

  createLeaveEmailPreview(
    input: CreateLeaveEmailPreviewInput,
  ): Promise<EmailPreviewPayload>;

  createLeaveDecisionLinks(
    input: CreateLeaveDecisionLinksInput,
  ): Promise<LeaveDecisionLinksResult>;

  processLeaveDecisionAction(
    input: ProcessLeaveDecisionInput,
  ): Promise<LeaveRequest>;

  confirmLeaveSubmission(
    input: ConfirmLeaveSubmissionInput,
  ): Promise<LeaveRequest>;

  getAttachmentsByLeaveRequest(
    leaveRequestId: string,
  ): Promise<LeaveRequestAttachment[]>;

  deleteLeaveRequest(id: string): Promise<void>;

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
    syncData: LeaveCalendarSyncInput,
  ): Promise<LeaveRequest>;

  /** @deprecated — use approveLeaveRequest / rejectLeaveRequest instead. */
  updateLeaveStatus(
    id: string,
    status: LeaveRequestStatus,
  ): Promise<LeaveRequest>;
}

// ── CalendarSyncService ────────────────────────────────────────────────────

export interface CalendarSyncService {
  syncShifts(
    shifts: Shift[],
    accessToken: string,
    calendarId: string,
  ): Promise<{ created: number; updated: number; deleted: number }>;
  runSync(
    shifts: ShiftData[],
    options: CalendarSyncRunOptions,
  ): Promise<CalendarSyncResult>;
  previewSync(
    shifts: ShiftData[],
    options: CalendarPreviewOptions,
  ): Promise<{
    summary: CalendarPreviewResult["summary"];
    changes: CalendarPreviewResult["changes"];
  }>;
}

// ── NotificationService ────────────────────────────────────────────────────

export interface NotificationService {
  notifyHR(subject: string, body: string): Promise<void>;
  /** Dispatched after a leave request status changes (pending→approved/rejected). */
  notifyLeaveStatusChange(payload: LeaveNotificationPayload): Promise<void>;
  backfillSwapRequestNotifications(userId: string): Promise<number>;
  listNotifications(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<AppNotification>>;
  markNotificationAsRead(notificationId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
}

// ── WorkflowService ────────────────────────────────────────────────────────

export interface WorkflowService {
  createActionToken(
    input: CreateActionTokenInput,
  ): Promise<WorkflowActionToken>;
  validateActionToken(token: string): Promise<WorkflowActionValidationResult>;
  consumeActionToken(
    input: ConsumeActionTokenInput,
  ): Promise<WorkflowActionValidationResult>;
}

// ── ReminderService ────────────────────────────────────────────────────────

export interface ReminderService {
  createReminder(input: CreateReminderInput): Promise<ReminderJob>;
  getRemindersByUser(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<ReminderJob>>;
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
  workflow: WorkflowService;
  reminders: ReminderService;
}
