/**
 * src/shared/mappers/leave.mapper.ts
 *
 * Maps Supabase DB row → LeaveRequest domain model.
 */

import type { Database } from "@/types/supabase";
import type { LeaveRequest } from "@/types/domain";

type DbLeaveRow = Database["public"]["Tables"]["leave_requests"]["Row"];

export function toLeaveRequest(row: DbLeaveRow): LeaveRequest {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    startDate: row.requested_start_date,
    endDate: row.requested_end_date,
    notes: row.requested_notes,
    status: row.status,
    sentToHrAt: row.sent_to_hr_at,
    decisionDueAt: row.decision_due_at,
    approvedStartDate: row.approved_start_date,
    approvedEndDate: row.approved_end_date,
    approvedNotes: row.approved_notes,
    hrResponseNotes: row.hr_response_notes,
    softDeclinedAt: row.soft_declined_at,
    calendarAppliedAt: row.calendar_applied_at,
    googleEventId: row.google_event_id,
    leaveUid: row.leave_uid,
    lastSyncedCalendarId: row.last_synced_calendar_id,
    noticeDaysRequested:
      (row as unknown as { notice_days_requested?: number | null })
        .notice_days_requested ?? null,
    noticePolicyDays:
      (row as unknown as { notice_policy_days?: number | null })
        .notice_policy_days ?? null,
    noticePolicyBreached:
      (row as unknown as { notice_policy_breached?: boolean | null })
        .notice_policy_breached ?? false,
    reminderScheduledAt:
      (row as unknown as { reminder_scheduled_at?: string | null })
        .reminder_scheduled_at ?? null,
    reminderSentAt:
      (row as unknown as { reminder_sent_at?: string | null })
        .reminder_sent_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
