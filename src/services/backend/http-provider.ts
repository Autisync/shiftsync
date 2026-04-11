/**
 * src/services/backend/http-provider.ts
 *
 * Stub BackendServices implementation for a future custom HTTP API.
 * All methods throw "Not implemented" until the backend is ready.
 * Replace stubs progressively during Phase 9 migration.
 */

import type {
  BackendServices,
  AuthService,
  UserService,
  ShiftService,
  UploadService,
  SwapService,
  LeaveService,
  CalendarSyncService,
  NotificationService,
} from "./types";

function notImplemented(method: string): never {
  throw new Error(
    `[HttpProvider] ${method} is not yet implemented. ` +
      "Switch VITE_BACKEND_MODE=supabase or implement the API endpoint.",
  );
}

const httpAuth: AuthService = {
  getSession: () => notImplemented("auth.getSession"),
  signInWithGoogle: () => notImplemented("auth.signInWithGoogle"),
  signOut: () => notImplemented("auth.signOut"),
  onAuthChange: () => notImplemented("auth.onAuthChange"),
};

const httpUsers: UserService = {
  getUserProfile: () => notImplemented("users.getUserProfile"),
  updateUserProfile: () => notImplemented("users.updateUserProfile"),
};

const httpShifts: ShiftService = {
  getShiftsForUser: () => notImplemented("shifts.getShiftsForUser"),
  getShiftById: () => notImplemented("shifts.getShiftById"),
  createShift: () => notImplemented("shifts.createShift"),
  updateShift: () => notImplemented("shifts.updateShift"),
  deleteShift: () => notImplemented("shifts.deleteShift"),
  updateGoogleEventId: () => notImplemented("shifts.updateGoogleEventId"),
};

const httpUploads: UploadService = {
  createUpload: () => notImplemented("uploads.createUpload"),
  getUploadById: () => notImplemented("uploads.getUploadById"),
  getUploadsByUser: () => notImplemented("uploads.getUploadsByUser"),
  getAccessRequestsForUpload: () =>
    notImplemented("uploads.getAccessRequestsForUpload"),
  createAccessRequest: () => notImplemented("uploads.createAccessRequest"),
  updateAccessRequest: () => notImplemented("uploads.updateAccessRequest"),
};

const httpSwaps: SwapService = {
  openAvailability: () => notImplemented("swaps.openAvailability"),
  closeAvailability: () => notImplemented("swaps.closeAvailability"),
  getOpenAvailabilities: () => notImplemented("swaps.getOpenAvailabilities"),
  createSwapRequest: () => notImplemented("swaps.createSwapRequest"),
  getSwapRequestsForUser: () => notImplemented("swaps.getSwapRequestsForUser"),
  updateSwapStatus: () => notImplemented("swaps.updateSwapStatus"),
};

const httpLeave: LeaveService = {
  createLeaveRequest: () => notImplemented("leave.createLeaveRequest"),
  getLeaveRequestsForUser: () =>
    notImplemented("leave.getLeaveRequestsForUser"),
  updateLeaveStatus: () => notImplemented("leave.updateLeaveStatus"),
};

const httpCalendar: CalendarSyncService = {
  syncShifts: () => notImplemented("calendar.syncShifts"),
  runSync: () => notImplemented("calendar.runSync"),
  previewSync: () => notImplemented("calendar.previewSync"),
};

const httpNotifications: NotificationService = {
  notifyHR: () => notImplemented("notifications.notifyHR"),
};

export class HttpProvider implements BackendServices {
  // baseUrl is reserved for Phase 9 actual HTTP implementation
  constructor(public readonly baseUrl: string) {}

  auth = httpAuth;
  users = httpUsers;
  shifts = httpShifts;
  uploads = httpUploads;
  swaps = httpSwaps;
  leave = httpLeave;
  calendar = httpCalendar;
  notifications = httpNotifications;
}
