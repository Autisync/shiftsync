import { Clock3, AlertTriangle } from "lucide-react";
import { SwapStatusBadge } from "@/components/swaps/SwapStatusBadge";
import type { SwapCalendarEventItem } from "@/components/swaps/swap-calendar.types";

interface SwapCalendarEventProps {
  event: SwapCalendarEventItem;
}

export function SwapCalendarEvent({ event }: SwapCalendarEventProps) {
  return (
    <div className="h-full rounded-md px-1.5 py-1 text-[11px] leading-tight">
      <p className="truncate font-semibold tracking-tight">{event.title}</p>
      {event.subtitle ? (
        <p className="truncate text-[10px] opacity-80">{event.subtitle}</p>
      ) : null}
      {event.allDay ? null : (
        <div className="mt-1 flex items-center gap-1">
          <Clock3 className="h-3 w-3" />
          <span>
            {event.start.toLocaleTimeString("pt-PT", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" - "}
            {event.end.toLocaleTimeString("pt-PT", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      )}
      <div className="mt-1 flex items-center gap-1">
        <SwapStatusBadge status={event.status} />
        {event.violation ? (
          <AlertTriangle className="h-3 w-3 text-rose-600" />
        ) : null}
      </div>
    </div>
  );
}
