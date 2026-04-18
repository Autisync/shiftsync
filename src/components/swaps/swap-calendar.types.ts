import type { LeaveRequest, Shift, SwapRequest } from "@/types/domain";

export type SwapCalendarEventStatus =
  | "normal"
  | "open"
  | "sent"
  | "received"
  | "approved"
  | "rejected"
  | "violation"
  | "leave";

export interface SwapCalendarEventItem {
  id: string;
  kind: "shift" | "leave";
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  shift?: Shift;
  leaveRequest?: LeaveRequest;
  status: SwapCalendarEventStatus;
  request?: SwapRequest;
  violation?: boolean;
}
