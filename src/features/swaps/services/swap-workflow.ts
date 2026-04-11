import type { SwapRequest, SwapRequestStatus } from "@/types/domain";

const ALLOWED_TRANSITIONS: Record<SwapRequestStatus, SwapRequestStatus[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["submitted_to_hr"],
  rejected: [],
  submitted_to_hr: ["approved"],
  approved: [],
};

export function canSwapStatusTransition(
  from: SwapRequestStatus,
  to: SwapRequestStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertSwapStatusTransition(
  from: SwapRequestStatus,
  to: SwapRequestStatus,
): void {
  if (!canSwapStatusTransition(from, to)) {
    throw new Error(`Invalid swap status transition: ${from} -> ${to}`);
  }
}

export function getSwapStatusBadgeClass(status: SwapRequestStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "accepted":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "submitted_to_hr":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "approved":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export function formatSwapStatus(status: SwapRequestStatus): string {
  switch (status) {
    case "pending":
      return "Pendente";
    case "accepted":
      return "Aceite";
    case "rejected":
      return "Rejeitado";
    case "submitted_to_hr":
      return "Submetido ao RH";
    case "approved":
      return "Aprovado";
    default:
      return status;
  }
}

export function getAllowedActionsForUser(
  request: SwapRequest,
  userId: string,
): SwapRequestStatus[] {
  if (request.status === "pending" && request.targetUserId === userId) {
    return ["accepted", "rejected"];
  }

  if (request.status === "accepted" && request.requesterUserId === userId) {
    return ["submitted_to_hr"];
  }

  if (
    request.status === "submitted_to_hr" &&
    request.requesterUserId === userId
  ) {
    return ["approved"];
  }

  return [];
}

export function getActionLabel(status: SwapRequestStatus): string {
  switch (status) {
    case "accepted":
      return "Aceitar";
    case "rejected":
      return "Rejeitar";
    case "submitted_to_hr":
      return "Submeter ao RH";
    case "approved":
      return "Marcar como Aprovado";
    default:
      return formatSwapStatus(status);
  }
}
