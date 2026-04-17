/**
 * src/shared/mappers/swap.mapper.ts
 *
 * Maps Supabase DB rows → SwapAvailability and SwapRequest domain models.
 */

import type { Database } from "@/types/supabase";
import type { SwapAvailability, SwapRequest } from "@/types/domain";

type DbSwapAvailRow = Database["public"]["Tables"]["swap_availability"]["Row"];
type DbSwapRequestRow = Database["public"]["Tables"]["swap_requests"]["Row"];

export function toSwapAvailability(row: DbSwapAvailRow): SwapAvailability {
  return {
    id: row.id,
    shiftId: row.shift_id,
    isOpen: row.is_open,
    openedByUserId: row.opened_by_user_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSwapRequest(row: DbSwapRequestRow): SwapRequest {
  const parsedHistory = Array.isArray(row.status_history)
    ? row.status_history
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const maybe = entry as {
            status?: unknown;
            changed_at?: unknown;
            changed_by_user_id?: unknown;
          };

          if (
            typeof maybe.status !== "string" ||
            typeof maybe.changed_at !== "string"
          ) {
            return null;
          }

          return {
            status: maybe.status as SwapRequest["status"],
            changedAt: maybe.changed_at,
            changedByUserId:
              typeof maybe.changed_by_user_id === "string"
                ? maybe.changed_by_user_id
                : null,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    targetUserId: row.target_user_id,
    requesterShiftId: row.requester_shift_id,
    targetShiftId: row.target_shift_id,
    status: row.status,
    message: row.message,
    statusHistory: parsedHistory,
    pendingAt: row.pending_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    submittedToHrAt: row.submitted_to_hr_at,
    approvedAt: row.approved_at,
    requesterHrSent:
      (row as unknown as { requester_hr_sent?: boolean }).requester_hr_sent ??
      false,
    targetHrSent:
      (row as unknown as { target_hr_sent?: boolean }).target_hr_sent ?? false,
    requesterHrApproved:
      (row as unknown as { requester_hr_approved?: boolean })
        .requester_hr_approved ?? false,
    targetHrApproved:
      (row as unknown as { target_hr_approved?: boolean }).target_hr_approved ??
      false,
    calendarUpdateEnabled:
      (row as unknown as { calendar_update_enabled?: boolean })
        .calendar_update_enabled ?? false,
    ruleViolation:
      (row as unknown as { rule_violation?: string }).rule_violation ?? null,
    violationReason:
      (row as unknown as { violation_reason?: string }).violation_reason ??
      null,
    hrEmailSent:
      (row as unknown as { hr_email_sent?: boolean }).hr_email_sent ?? false,
    calendarApplied:
      (row as unknown as { calendar_applied?: boolean }).calendar_applied ??
      false,
    hrDecisionTokenExpiresAt:
      (row as unknown as { hr_decision_token_expires_at?: string | null })
        .hr_decision_token_expires_at ?? null,
    hrDecisionActionedAt:
      (row as unknown as { hr_decision_actioned_at?: string | null })
        .hr_decision_actioned_at ?? null,
    hrDecisionAction:
      (
        row as unknown as {
          hr_decision_action?: "approve" | "decline" | null;
        }
      ).hr_decision_action ?? null,
    hrDecisionBy:
      (row as unknown as { hr_decision_by?: string | null }).hr_decision_by ??
      null,
    hrDecisionReason:
      (row as unknown as { hr_decision_reason?: string | null })
        .hr_decision_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
