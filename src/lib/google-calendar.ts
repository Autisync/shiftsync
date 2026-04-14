import { GoogleCalendar, CalendarEvent, ShiftData } from "@/types/shift";

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Builds the Google Calendar event payload from a ShiftData object.
 * Exported so Phase 3 fingerprinting utilities can produce canonical event
 * representations without going through the GoogleCalendarService class.
 */
export function buildCalendarEventPayload(
  shift: ShiftData,
): Partial<CalendarEvent> {
  const startDateTime = new Date(shift.date);
  const [startHour, startMinute] = shift.startTime.split(":").map(Number);
  startDateTime.setHours(startHour, startMinute, 0, 0);

  const endDateTime = new Date(shift.date);
  const [endHour, endMinute] = shift.endTime.split(":").map(Number);
  endDateTime.setHours(endHour, endMinute, 0, 0);

  const shiftTypeCapitalized =
    shift.shiftType.charAt(0).toUpperCase() + shift.shiftType.slice(1);
  let summary = `Shift - ${shiftTypeCapitalized}`;
  if (shift.lob) {
    summary = `${shift.lob} - ${shiftTypeCapitalized}`;
  }

  const descriptionParts: string[] = [];
  if (shift.employeeName)
    descriptionParts.push(`Employee: ${shift.employeeName}`);
  if (shift.lob) descriptionParts.push(`LOB: ${shift.lob}`);
  if (shift.location) descriptionParts.push(`Location: ${shift.location}`);
  if (shift.notes) descriptionParts.push(`Notes: ${shift.notes}`);
  descriptionParts.push(`Week ${shift.week}`);

  return {
    summary,
    description: descriptionParts.join("\n"),
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: "Europe/Lisbon",
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: "Europe/Lisbon",
    },
  };
}

export class GoogleCalendarService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return undefined;
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    const raw = await response.text();
    if (!raw) {
      return undefined;
    }

    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private async fetchAPI<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${GOOGLE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      let message = "API request failed";
      const body = await this.readResponseBody(response);

      if (body && typeof body === "object") {
        const maybe = body as {
          error?: { message?: string };
          message?: string;
        };
        message = maybe.error?.message || maybe.message || message;
      } else if (typeof body === "string" && body.trim()) {
        message = body;
      }

      const err = new Error(message) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    return (await this.readResponseBody(response)) as T;
  }

  async listCalendars(): Promise<GoogleCalendar[]> {
    const data = await this.fetchAPI<{ items?: GoogleCalendar[] }>(
      "/users/me/calendarList",
    );
    return data.items || [];
  }

  async createCalendar(
    summary: string,
    timeZone: string = "Europe/Lisbon",
    description?: string,
  ): Promise<{ id: string; summary: string }> {
    const body: { summary: string; timeZone: string; description?: string } = {
      summary,
      timeZone,
    };
    if (description) body.description = description;

    const data = await this.fetchAPI<{ id: string; summary: string }>(
      "/calendars",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return { id: data.id, summary: data.summary };
  }

  async getEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string,
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    });

    const data = await this.fetchAPI<{ items?: CalendarEvent[] }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    );
    return data.items || [];
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return this.fetchAPI<CalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }

  async createEvent(
    calendarId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent> {
    return this.fetchAPI<CalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify(buildCalendarEventPayload(shift)),
      },
    );
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    shift: ShiftData,
  ): Promise<CalendarEvent> {
    return this.fetchAPI<CalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PUT",
        body: JSON.stringify(buildCalendarEventPayload(shift)),
      },
    );
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.fetchAPI(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: "DELETE" },
      );
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message =
        error instanceof Error
          ? error.message.toLowerCase()
          : String(error).toLowerCase();
      if (
        status === 404 ||
        status === 410 ||
        message.includes("resource has been deleted")
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Creates an all-day leave event using a raw payload (not a ShiftData object).
   * Used by leave calendar sync.
   */
  async createLeaveEvent(
    calendarId: string,
    payload: object,
  ): Promise<CalendarEvent> {
    return this.fetchAPI<CalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  /**
   * Updates (PATCH) an existing leave event by eventId.
   * Used by leave calendar sync for both date-change updates and idempotent re-syncs.
   */
  async updateLeaveEvent(
    calendarId: string,
    eventId: string,
    payload: object,
  ): Promise<CalendarEvent> {
    return this.fetchAPI<CalendarEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  }
}
