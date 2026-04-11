import {
  GoogleCalendarService,
  buildCalendarEventPayload,
} from "@/lib/google-calendar";
import type { CalendarEvent, ShiftData } from "@/types/shift";

export interface CalendarProviderAdapter {
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  listEvents?(
    calendarId: string,
    input: { timeMin: string; timeMax: string },
  ): Promise<CalendarEvent[]>;
  createEvent(calendarId: string, shift: ShiftData): Promise<CalendarEvent>;
  updateEvent(
    calendarId: string,
    eventId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

export class GoogleCalendarAdapter implements CalendarProviderAdapter {
  private readonly service: GoogleCalendarService;

  constructor(accessToken: string) {
    this.service = new GoogleCalendarService(accessToken);
  }

  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return this.service.getEvent(calendarId, eventId);
  }

  listEvents(
    calendarId: string,
    input: { timeMin: string; timeMax: string },
  ): Promise<CalendarEvent[]> {
    return this.service.getEvents(calendarId, input.timeMin, input.timeMax);
  }

  createEvent(calendarId: string, shift: ShiftData): Promise<CalendarEvent> {
    return this.service.createEvent(calendarId, shift);
  }

  updateEvent(
    calendarId: string,
    eventId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent> {
    return this.service.updateEvent(calendarId, eventId, shift);
  }

  deleteEvent(calendarId: string, eventId: string): Promise<void> {
    return this.service.deleteEvent(calendarId, eventId);
  }
}

export function extractEventMetadata(shift: ShiftData): {
  start: string;
  end: string;
  title: string;
  description: string;
  location: string;
} {
  const payload = buildCalendarEventPayload(shift);
  return {
    start: payload.start?.dateTime ?? "",
    end: payload.end?.dateTime ?? "",
    title: payload.summary ?? "",
    description: payload.description ?? "",
    location: shift.location ?? "",
  };
}
