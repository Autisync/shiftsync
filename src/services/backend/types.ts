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
} from "@/types/domain";
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
  updateSwapStatus(id: string, status: SwapRequestStatus): Promise<SwapRequest>;
}

// ── LeaveService ───────────────────────────────────────────────────────────

export interface LeaveService {
  createLeaveRequest(
    data: Omit<LeaveRequest, "id" | "status" | "createdAt" | "updatedAt">,
  ): Promise<LeaveRequest>;
  getLeaveRequestsForUser(userId: string): Promise<LeaveRequest[]>;
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
