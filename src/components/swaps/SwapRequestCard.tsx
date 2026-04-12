import { CalendarCheck2, Mail, TriangleAlert, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Shift, SwapRequest, SwapRequestStatus } from "@/types/domain";
import {
  formatSwapStatus,
  getSwapStatusBadgeClass,
} from "@/features/swaps/services/swap-workflow";

interface SwapRequestCardProps {
  request: SwapRequest;
  currentUserId: string;
  userDisplayNames?: Record<string, string>;
  shiftById?: Record<string, Shift>;
  onStatusChange: (request: SwapRequest, status: SwapRequestStatus) => void;
  onSendToHr: (request: SwapRequest) => void;
  onApplySwap: (request: SwapRequest) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShiftDateTime(shift: Shift | null | undefined): string {
  if (!shift) return "turno nao identificado";
  const date = new Date(shift.startsAt).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const start = new Date(shift.startsAt).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(shift.endsAt).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${start}-${end}`;
}

export function SwapRequestCard({
  request,
  currentUserId,
  userDisplayNames,
  shiftById,
  onStatusChange,
  onSendToHr,
  onApplySwap,
}: SwapRequestCardProps) {
  const received = request.targetUserId === currentUserId;
  const requesterName =
    userDisplayNames?.[request.requesterUserId] ??
    request.requesterUserId.slice(0, 8);
  const targetName =
    userDisplayNames?.[request.targetUserId] ??
    request.targetUserId.slice(0, 8);
  const requesterShift = shiftById?.[request.requesterShiftId];
  const targetShift = request.targetShiftId
    ? shiftById?.[request.targetShiftId]
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_6px_20px_-18px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1">
          <User className="h-3 w-3" />
          {received
            ? `Pedido recebido de ${requesterName}`
            : `Pedido enviado para ${targetName}`}
        </p>
        <span
          className={`rounded border px-2 py-0.5 text-xs ${getSwapStatusBadgeClass(request.status)}`}
        >
          {formatSwapStatus(request.status)}
        </span>
      </div>

      <div className="mt-2 space-y-2 text-xs text-slate-600">
        <p>
          {requesterName} quer trocar o turno de{" "}
          {formatShiftDateTime(requesterShift)} por{" "}
          {targetShift
            ? formatShiftDateTime(targetShift)
            : "um turno em aberto"}
          .
        </p>
        <div className="grid grid-cols-2 gap-2">
          <p>Criado: {formatDate(request.createdAt)}</p>
          <p>
            Enviado ao RH:{" "}
            {formatDate(
              request.submittedToHrAt ??
                (request.hrEmailSent ? request.updatedAt : null),
            )}
          </p>
        </div>
      </div>

      {request.ruleViolation ? (
        <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 flex items-start gap-1">
          <TriangleAlert className="h-3 w-3 mt-0.5" />
          <span>{request.violationReason || request.ruleViolation}</span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {request.status === "pending" && received ? (
          <>
            <Button
              size="sm"
              onClick={() => onStatusChange(request, "accepted")}
            >
              Aceitar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange(request, "rejected")}
            >
              Rejeitar
            </Button>
          </>
        ) : null}

        {request.status === "accepted" &&
        request.requesterUserId === currentUserId ? (
          <Button size="sm" onClick={() => onSendToHr(request)}>
            <Mail className="mr-1 h-3 w-3" />
            Enviar para RH
          </Button>
        ) : null}

        {request.status === "submitted_to_hr" &&
        request.requesterUserId === currentUserId ? (
          <Button size="sm" onClick={() => onStatusChange(request, "approved")}>
            Marcar como aprovado
          </Button>
        ) : null}

        {request.status === "approved" &&
        request.requesterUserId === currentUserId &&
        !request.calendarApplied ? (
          <Button size="sm" onClick={() => onApplySwap(request)}>
            <CalendarCheck2 className="mr-1 h-3 w-3" />
            Atualizar calendario
          </Button>
        ) : null}
      </div>
    </div>
  );
}
