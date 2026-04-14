/**
 * src/features/notifications/notification-service.ts
 *
 * Application-level notification dispatcher.
 * Routes domain events through the BackendServices.notifications contract —
 * never calls email transports or Supabase directly.
 * UI and domain services must import only from this module, not from backend types.
 */

import type { LeaveRequest } from "@/types/domain";
import type { NotificationService } from "@/services/backend/types";

/**
 * Notify all relevant parties when a leave request status changes.
 * The transport (email, Supabase Edge Function, webhook) is resolved by the
 * active NotificationService implementation; the call site never knows.
 */
export async function dispatchLeaveStatusChange(
  service: NotificationService,
  leave: LeaveRequest,
): Promise<void> {
  await service.notifyLeaveStatusChange({
    leaveRequestId: leave.id,
    userId: leave.userId,
    status: leave.status,
    startDate: leave.startDate,
    endDate: leave.endDate,
    type: leave.type,
    notes: leave.notes,
    updatedAt: leave.updatedAt,
  });
}
