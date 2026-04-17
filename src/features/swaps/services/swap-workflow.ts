import type { SwapRequest, SwapRequestStatus } from "@/types/domain";

const ALLOWED_TRANSITIONS: Record<SwapRequestStatus, SwapRequestStatus[]> = {
  pending: ["accepted", "awaiting_hr_request", "rejected"],
  accepted: ["submitted_to_hr", "awaiting_hr_request", "rejected"],
  submitted_to_hr: ["approved", "ready_to_apply", "rejected"],
  approved: ["applied"],
  awaiting_hr_request: ["ready_to_apply", "rejected"],
  rejected: [],
  ready_to_apply: ["approved", "applied"],
  applied: [],
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
    case "submitted_to_hr":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "approved":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "awaiting_hr_request":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "ready_to_apply":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "applied":
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
    case "submitted_to_hr":
      return "Submetido ao RH";
    case "approved":
      return "Aprovado";
    case "awaiting_hr_request":
      return "Aguardando RH";
    case "rejected":
      return "Rejeitado";
    case "ready_to_apply":
      return "Pronto para aplicar";
    case "applied":
      return "Aplicado";
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

  if (
    request.status === "awaiting_hr_request" &&
    request.requesterUserId === userId
  ) {
    return ["ready_to_apply"];
  }

  if (
    request.status === "ready_to_apply" &&
    request.requesterUserId === userId
  ) {
    return ["applied"];
  }

  return [];
}

export function getActionLabel(status: SwapRequestStatus): string {
  switch (status) {
    case "accepted":
      return "Aceitar";
    case "awaiting_hr_request":
      return "Aguardando RH";
    case "submitted_to_hr":
      return "Enviar para RH";
    case "approved":
      return "Marcar como aprovado";
    case "rejected":
      return "Rejeitar";
    case "ready_to_apply":
      return "Marcar pronto para aplicar";
    case "applied":
      return "Marcar como aplicado";
    default:
      return formatSwapStatus(status);
  }
}
