/**
 * src/features/leave/services/leave-workflow.ts
 *
 * Pure domain logic for leave request status transitions and display helpers.
 * No Supabase, no fetch — pure functions only.
 */

import type { LeaveRequestStatus } from "@/types/domain";

// ── Allowed status transitions ─────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<LeaveRequestStatus, LeaveRequestStatus[]> = {
  draft: ["pending"],
  pending: ["approved", "rejected", "soft_declined"],
  approved: [],
  rejected: [],
  soft_declined: [],
};

export function canLeaveStatusTransition(
  from: LeaveRequestStatus,
  to: LeaveRequestStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertLeaveStatusTransition(
  from: LeaveRequestStatus,
  to: LeaveRequestStatus,
): void {
  if (!canLeaveStatusTransition(from, to)) {
    throw new Error(`Invalid leave status transition: ${from} → ${to}`);
  }
}

// ── Leave types ────────────────────────────────────────────────────────────

export const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "vacation", label: "Férias" },
  { value: "sick", label: "Doença" },
  { value: "personal", label: "Pessoal" },
  { value: "other", label: "Outro" },
];

export function getLeaveTypeLabel(type: string): string {
  return LEAVE_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Returns true when the leave type is a vacation (férias). */
export function isVacationType(type: string): boolean {
  return type === "vacation";
}

// ── Status display helpers ─────────────────────────────────────────────────

export function formatLeaveStatus(status: LeaveRequestStatus): string {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "pending":
      return "Pendente";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "soft_declined":
      return "Expirado";
    default:
      return status;
  }
}

export function getLeaveStatusBadgeClass(status: LeaveRequestStatus): string {
  switch (status) {
    case "draft":
      return "bg-slate-50 text-slate-500 border-slate-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "soft_declined":
      return "bg-zinc-50 text-zinc-500 border-zinc-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

// ── Date range helpers ─────────────────────────────────────────────────────

export function formatLeaveDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Returns the number of calendar days in the leave range [startDate, endDate] (inclusive).
 */
export function getLeaveDurationDays(
  startDate: string,
  endDate: string,
): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Returns the effective display dates for a leave request.
 * Uses approved dates when set (post-HR review), otherwise falls back to requested dates.
 */
export function getEffectiveLeaveDates(leave: {
  startDate: string;
  endDate: string;
  approvedStartDate: string | null;
  approvedEndDate: string | null;
}): { startDate: string; endDate: string } {
  return {
    startDate: leave.approvedStartDate ?? leave.startDate,
    endDate: leave.approvedEndDate ?? leave.endDate,
  };
}

/**
 * Returns a human-readable title for a calendar event based on leave type.
 */
export function getLeaveCalendarTitle(type: string): string {
  switch (type) {
    case "vacation":
      return "Férias";
    case "sick":
      return "Baixa Médica";
    case "personal":
      return "Ausência Pessoal";
    default:
      return "Ausência Aprovada";
  }
}
