import { cn } from "@/lib/utils";
import type { SwapCalendarEventStatus } from "@/components/swaps/swap-calendar.types";

const STATUS_META: Record<
  SwapCalendarEventStatus,
  { label: string; className: string }
> = {
  normal: {
    label: "Normal",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  open: {
    label: "Aberto",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  sent: {
    label: "Enviado",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  received: {
    label: "Recebido",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  approved: {
    label: "Aprovado",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  rejected: {
    label: "Rejeitado",
    className: "bg-slate-100 text-slate-700 border-slate-300",
  },
  violation: {
    label: "Aviso 6/60",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

interface SwapStatusBadgeProps {
  status: SwapCalendarEventStatus;
}

export function SwapStatusBadge({ status }: SwapStatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
