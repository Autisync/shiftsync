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
  WorkflowService,
  ReminderService,
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
  getDefaultCalendarPreference: () =>
    notImplemented("users.getDefaultCalendarPreference"),
  saveDefaultCalendarPreference: () =>
    notImplemented("users.saveDefaultCalendarPreference"),
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
  getUploadsByUserPaginated: () =>
    notImplemented("uploads.getUploadsByUserPaginated"),
  getUploadTrustAssessments: () =>
    notImplemented("uploads.getUploadTrustAssessments"),
  getUploadTrustAssessmentByUpload: () =>
    notImplemented("uploads.getUploadTrustAssessmentByUpload"),
  startUploadSelectionSync: () =>
    notImplemented("uploads.startUploadSelectionSync"),
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
  getSwapRequestById: () => notImplemented("swaps.getSwapRequestById"),
  getSwapRequestsForUser: () => notImplemented("swaps.getSwapRequestsForUser"),
  getSwapRequestsForUserPaginated: () =>
    notImplemented("swaps.getSwapRequestsForUserPaginated"),
  updateSwapStatus: (_id, _status, _actorUserId) =>
    notImplemented("swaps.updateSwapStatus"),
  acceptSwapRequest: () => notImplemented("swaps.acceptSwapRequest"),
  sendHREmail: () => notImplemented("swaps.sendHREmail"),
  markHREmailSent: () => notImplemented("swaps.markHREmailSent"),
  markHRApproved: () => notImplemented("swaps.markHRApproved"),
  createHrDecisionLinks: () => notImplemented("swaps.createHrDecisionLinks"),
  processHrDecisionAction: () =>
    notImplemented("swaps.processHrDecisionAction"),
  applySwap: () => notImplemented("swaps.applySwap"),
  getHRSettings: () => notImplemented("swaps.getHRSettings"),
  saveHRSettings: () => notImplemented("swaps.saveHRSettings"),
};

const httpLeave: LeaveService = {
  createLeaveRequest: () => notImplemented("leave.createLeaveRequest"),
  getLeaveRequestById: () => notImplemented("leave.getLeaveRequestById"),
  getLeaveRequestsForUser: () =>
    notImplemented("leave.getLeaveRequestsForUser"),
  getLeaveRequestsForUserPaginated: () =>
    notImplemented("leave.getLeaveRequestsForUserPaginated"),
  createLeaveEmailPreview: () =>
    notImplemented("leave.createLeaveEmailPreview"),
  createLeaveDecisionLinks: () =>
    notImplemented("leave.createLeaveDecisionLinks"),
  processLeaveDecisionAction: () =>
    notImplemented("leave.processLeaveDecisionAction"),
  confirmLeaveSubmission: () => notImplemented("leave.confirmLeaveSubmission"),
  getAttachmentsByLeaveRequest: () =>
    notImplemented("leave.getAttachmentsByLeaveRequest"),
  deleteLeaveRequest: () => notImplemented("leave.deleteLeaveRequest"),
  markSentToHR: () => notImplemented("leave.markSentToHR"),
  approveLeaveRequest: () => notImplemented("leave.approveLeaveRequest"),
  rejectLeaveRequest: () => notImplemented("leave.rejectLeaveRequest"),
  updateApprovedDates: () => notImplemented("leave.updateApprovedDates"),
  recordCalendarSync: () => notImplemented("leave.recordCalendarSync"),
  updateLeaveStatus: () => notImplemented("leave.updateLeaveStatus"),
};

const httpCalendar: CalendarSyncService = {
  syncShifts: () => notImplemented("calendar.syncShifts"),
  runSync: () => notImplemented("calendar.runSync"),
  previewSync: () => notImplemented("calendar.previewSync"),
  connectGoogleCalendar: () => notImplemented("calendar.connectGoogleCalendar"),
  updateConnection: () => notImplemented("calendar.updateConnection"),
  getConnectionStatus: () => notImplemented("calendar.getConnectionStatus"),
  triggerSync: () => notImplemented("calendar.triggerSync"),
  pullLatestGoogleChanges: () =>
    notImplemented("calendar.pullLatestGoogleChanges"),
  disconnectProvider: () => notImplemented("calendar.disconnectProvider"),
};

const httpNotifications: NotificationService = {
  notifyHR: () => notImplemented("notifications.notifyHR"),
  notifyLeaveStatusChange: () =>
    notImplemented("notifications.notifyLeaveStatusChange"),
  backfillSwapRequestNotifications: () =>
    notImplemented("notifications.backfillSwapRequestNotifications"),
  listNotifications: () => notImplemented("notifications.listNotifications"),
  markNotificationAsRead: () =>
    notImplemented("notifications.markNotificationAsRead"),
  markAllNotificationsAsRead: () =>
    notImplemented("notifications.markAllNotificationsAsRead"),
  getUnreadCount: () => notImplemented("notifications.getUnreadCount"),
};

const httpWorkflow: WorkflowService = {
  createActionToken: () => notImplemented("workflow.createActionToken"),
  validateActionToken: () => notImplemented("workflow.validateActionToken"),
  consumeActionToken: () => notImplemented("workflow.consumeActionToken"),
};

const httpReminders: ReminderService = {
  createReminder: () => notImplemented("reminders.createReminder"),
  getRemindersByUser: () => notImplemented("reminders.getRemindersByUser"),
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
  workflow = httpWorkflow;
  reminders = httpReminders;
}
