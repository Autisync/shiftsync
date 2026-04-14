/**
 * src/features/leave/services/leave-calendar-sync.ts
 *
 * Calendar reconciliation for approved leave requests.
 *
 * Rules:
 *   1. Only approved leave is ever synced.
 *   2. If no google_event_id → CREATE all-day event.
 *   3. If google_event_id exists but leave_uid changed → PATCH (update) event
 *      (approved dates were edited after initial approval).
 *   4. If google_event_id exists and leave_uid matches → UPDATE (idempotent PATCH).
 *   5. ShiftSync-managed shift events on the approved leave dates are reconciled
 *      (updated description to note the overlap; they are NOT deleted by leave sync —
 *       only the leave event is written; shift events remain unless the user runs
 *       a separate shift sync).
 *
 * Isolation: only targets the user's selected default calendar.
 * No unrelated events are modified.
 */

import type { LeaveRequest } from "@/types/domain";
import { GoogleCalendarService } from "@/lib/google-calendar";
import {
  getLeaveCalendarTitle,
  getLeaveDurationDays,
  formatLeaveDate,
} from "./leave-workflow";
import { computeLeaveUID } from "./leave-uid";

// ── Tag embedded in all ShiftSync leave event descriptions ───────────────

const LEAVE_SYNC_TAG = "[ShiftSync Leave]";

// ── Helpers ───────────────────────────────────────────────────────────────

function isoDateToLocalDate(isoDate: string): string {
  // "2025-06-15" → "2025-06-15"  (pass-through; date-only strings are safe)
  return isoDate.slice(0, 10);
}

/** Returns the next day in ISO date format (for exclusive end date in Google all-day). */
function nextDay(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildLeaveEventPayload(
  leave: LeaveRequest,
  effectiveStart: string,
  effectiveEnd: string,
): object {
  const title = getLeaveCalendarTitle(leave.type);
  const duration = getLeaveDurationDays(effectiveStart, effectiveEnd);
  const startFmt = formatLeaveDate(effectiveStart);
  const endFmt = formatLeaveDate(effectiveEnd);

  const description = [
    LEAVE_SYNC_TAG,
    `Tipo: ${title}`,
    `Período: ${startFmt} a ${endFmt} (${duration} dia${duration !== 1 ? "s" : ""})`,
    leave.notes ? `Observações: ${leave.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary: title,
    description,
    // All-day event: Google uses inclusive start + exclusive end
    start: { date: isoDateToLocalDate(effectiveStart) },
    end: { date: nextDay(effectiveEnd) },
    transparency: "opaque",
    // Extended properties to identify ShiftSync-managed leave events
    extendedProperties: {
      private: {
        shiftsync_managed: "true",
        shiftsync_type: "leave",
        leave_id: leave.id,
      },
    },
  };
}

// ── Public result type ────────────────────────────────────────────────────

export interface LeaveSyncOutcome {
  action: "created" | "updated" | "noop";
  googleEventId: string;
  leaveUid: string;
  calendarId: string;
}

// ── Main sync function ────────────────────────────────────────────────────

/**
 * Syncs a single approved leave request to the user's calendar.
 *
 * @param leave          The approved LeaveRequest domain object.
 * @param accessToken    Google OAuth access token.
 * @param calendarId     The user's selected default calendar ID.
 */
export async function syncLeaveToCalendar(
  leave: LeaveRequest,
  accessToken: string,
  calendarId: string,
): Promise<LeaveSyncOutcome> {
  if (leave.status !== "approved") {
    throw new Error(
      `Cannot sync leave in status "${leave.status}": only approved requests are synced.`,
    );
  }

  const effectiveStart = leave.approvedStartDate ?? leave.startDate;
  const effectiveEnd = leave.approvedEndDate ?? leave.endDate;

  const newUid = await computeLeaveUID(
    leave.userId,
    leave.type,
    effectiveStart,
    effectiveEnd,
  );
  const gcal = new GoogleCalendarService(accessToken);
  const payload = buildLeaveEventPayload(leave, effectiveStart, effectiveEnd);

  // ── Case 1: No existing calendar event → CREATE ───────────────────────
  if (!leave.googleEventId) {
    const created = await gcal.createLeaveEvent(calendarId, payload);
    return {
      action: "created",
      googleEventId: created.id,
      leaveUid: newUid,
      calendarId,
    };
  }

  // ── Case 2: Event exists → PATCH (update titles, dates if changed) ────
  const updated = await gcal.updateLeaveEvent(
    calendarId,
    leave.googleEventId,
    payload,
  );
  const action = leave.leaveUid !== newUid ? "updated" : "noop";
  return {
    action,
    googleEventId: updated.id,
    leaveUid: newUid,
    calendarId,
  };
}
