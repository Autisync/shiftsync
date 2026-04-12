import type { Shift, SwapRequest } from "@/types/domain";

export type SwapCalendarEventStatus =
  | "normal"
  | "open"
  | "sent"
  | "received"
  | "approved"
  | "rejected"
  | "violation";

export interface SwapCalendarEventItem {
  id: string;
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  shift: Shift;
  status: SwapCalendarEventStatus;
  request?: SwapRequest;
  violation?: boolean;
}
