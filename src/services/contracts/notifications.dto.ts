/**
 * src/services/contracts/notifications.dto.ts
 *
 * Data-transfer objects for NotificationService operations.
 */

import type { LeaveRequestStatus } from "@/types/domain";

/**
 * Payload dispatched whenever a leave request status changes.
 * Consumed by the notification service and audit log.
 */
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
