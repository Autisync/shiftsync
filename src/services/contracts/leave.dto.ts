/**
 * src/services/contracts/leave.dto.ts
 *
 * Data-transfer objects for LeaveService operations.
 */

import type { LeaveRequest } from "@/types/domain";
import type { FileAttachmentInput, EmailPreviewPayload } from "./common.dto";

/**
 * Fields submitted when creating a new leave request (draft).
 * Server-managed fields (id, status, timestamps, HR decision fields) are excluded.
 */
export type CreateLeaveRequestInput = Omit<
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
>;

/**
 * Input to generate an HR email preview for a leave request.
 */
export interface CreateLeaveEmailPreviewInput {
  leaveRequestId: string;
  hrEmail: string;
  ccEmails?: string[];
  employeeName?: string;
  employeeCode?: string;
  attachments?: FileAttachmentInput[];
}

/**
 * Input to generate one-time HR decision links for approve/decline/adjust.
 */
export interface CreateLeaveDecisionLinksInput {
  leaveRequestId: string;
  baseUrl?: string;
  expiresInHours?: number;
}

/**
 * Links returned by createLeaveDecisionLinks.
 */
export interface LeaveDecisionLinksResult {
  approveUrl: string;
  declineUrl: string;
  adjustUrl: string;
  expiresAt: string;
}

/**
 * Input when HR processes a leave decision via a one-time link.
 */
export interface ProcessLeaveDecisionInput {
  token: string;
  action: "approve" | "decline" | "adjust";
  actorEmail?: string;
}

/**
 * Input when the user confirms and submits a leave request to HR
 * (transitions draft → pending, records sent_to_hr_at).
 */
export interface ConfirmLeaveSubmissionInput {
  leaveRequestId: string;
  emailPreview: EmailPreviewPayload;
  attachments?: FileAttachmentInput[];
}

/**
 * Input to the HR approval path (front-end reviewer, not email link).
 */
export interface LeaveApproveInput {
  /** HR-confirmed start date. Defaults to requested dates if omitted. */
  approvedStartDate?: string;
  /** HR-confirmed end date. Defaults to requested dates if omitted. */
  approvedEndDate?: string;
  approvedNotes?: string;
  hrResponseNotes?: string;
}

/**
 * Input to the HR rejection path (front-end reviewer, not email link).
 */
export interface LeaveRejectInput {
  hrResponseNotes?: string;
}

/**
 * Input to record a successful Google Calendar sync for an approved leave request.
 */
export interface LeaveCalendarSyncInput {
  googleEventId: string;
  leaveUid: string;
  calendarId: string;
}

/**
 * Result from a leave ↔ calendar synchronisation operation.
 */
export interface LeaveSyncResult {
  created: number;
  updated: number;
  googleEventId: string;
  leaveUid: string;
  calendarId: string;
}
