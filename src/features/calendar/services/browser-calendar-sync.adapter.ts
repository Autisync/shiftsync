import {
  GoogleCalendarService,
  buildCalendarEventPayload,
} from "@/lib/google-calendar";
import type { ShiftData, CalendarEvent } from "@/types/shift";
import type { CalendarPreviewSyncResult } from "@/services/backend/types";

function normalizeText(value?: string): string {
  return (value ?? "").trim();
}

function sameInstant(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }

  return new Date(a).getTime() === new Date(b).getTime();
}

function isSameEvent(
  event: CalendarEvent,
  payload: Partial<CalendarEvent>,
): boolean {
  return (
    normalizeText(event.summary) === normalizeText(payload.summary) &&
    sameInstant(event.start?.dateTime, payload.start?.dateTime) &&
    sameInstant(event.end?.dateTime, payload.end?.dateTime) &&
    normalizeText(event.description) === normalizeText(payload.description)
  );
}

function findMatchingEvent(
  events: CalendarEvent[],
  payload: Partial<CalendarEvent>,
): CalendarEvent | undefined {
  return events.find((event) => isSameEvent(event, payload));
}

function eventDay(value?: string): string {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function isManagedShiftEvent(event: CalendarEvent): boolean {
  const description = (event.description ?? "").toLowerCase();
  return (
    description.includes("week ") ||
    description.includes("employee:") ||
    description.includes("lob:")
  );
}

function isDeleteGoneError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 404 || status === 410) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return message.includes("resource has been deleted");
}

function findUpdateCandidate(
  events: CalendarEvent[],
  payload: Partial<CalendarEvent>,
): CalendarEvent | undefined {
  const targetSummary = normalizeText(payload.summary);
  const targetDay = eventDay(payload.start?.dateTime);
  const targetStart = payload.start?.dateTime
    ? new Date(payload.start.dateTime).getTime()
    : 0;

  const candidates = events.filter((event) => {
    if (!isManagedShiftEvent(event)) {
      return false;
    }

    if (normalizeText(event.summary) !== targetSummary) {
      return false;
    }

    const day = eventDay(event.start?.dateTime);
    if (!day || !targetDay) {
      return false;
    }

    const dayDelta =
      Math.abs(
        new Date(`${day}T00:00:00.000Z`).getTime() -
          new Date(`${targetDay}T00:00:00.000Z`).getTime(),
      ) /
      (24 * 60 * 60 * 1000);

    return dayDelta <= 2;
  });

  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const sorted = [...candidates].sort((a, b) => {
    const aDelta = Math.abs(
      new Date(a.start?.dateTime ?? 0).getTime() - targetStart,
    );
    const bDelta = Math.abs(
      new Date(b.start?.dateTime ?? 0).getTime() - targetStart,
    );
    return aDelta - bDelta;
  });

  const best = sorted[0];
  const second = sorted[1];
  if (!second) {
    return best;
  }

  const bestDelta = Math.abs(
    new Date(best.start?.dateTime ?? 0).getTime() - targetStart,
  );
  const secondDelta = Math.abs(
    new Date(second.start?.dateTime ?? 0).getTime() - targetStart,
  );
  if (bestDelta === secondDelta) {
    return undefined;
  }

  return best;
}

function getWindow(shifts: ShiftData[]): { timeMin: string; timeMax: string } {
  const timestamps = shifts.map((shift) => new Date(shift.date).getTime());
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const dayMs = 24 * 60 * 60 * 1000;

  return {
    timeMin: new Date(min - dayMs).toISOString(),
    timeMax: new Date(max + 2 * dayMs).toISOString(),
  };
}

export class BrowserCalendarSyncAdapter {
  constructor(private readonly accessToken: string) {}

  async syncPreviewShifts(
    shifts: ShiftData[],
    calendarId: string,
  ): Promise<CalendarPreviewSyncResult> {
    const service = new GoogleCalendarService(this.accessToken);
    const summary: CalendarPreviewSyncResult["summary"] = {
      created: 0,
      updated: 0,
      deleted: 0,
      noop: 0,
      failed: 0,
      updatedFromGoogle: 0,
    };

    if (shifts.length === 0) {
      return { summary, syncedShifts: [], errors: [], changes: [] };
    }

    const { timeMin, timeMax } = getWindow(shifts);
    const calendarEvents = await service.getEvents(
      calendarId,
      timeMin,
      timeMax,
    );
    const events = [...calendarEvents];
    const syncedShifts: ShiftData[] = [];
    const errors: NonNullable<CalendarPreviewSyncResult["errors"]> = [];
    const changes: NonNullable<CalendarPreviewSyncResult["changes"]> = [];
    const matchedEventIds = new Set<string>();

    const desiredShiftEventKeys = new Set(
      shifts
        .filter((shift) => shift.status !== "deleted")
        .map((shift) => {
          const payload = buildCalendarEventPayload(shift);
          return `${eventDay(payload.start?.dateTime)}|${normalizeText(payload.summary)}`;
        }),
    );

    for (const shift of shifts) {
      try {
        const payload = buildCalendarEventPayload(shift);
        let existingById = shift.googleEventId
          ? events.find((event) => event.id === shift.googleEventId)
          : undefined;

        if (!existingById && shift.googleEventId) {
          try {
            existingById = await service.getEvent(
              calendarId,
              shift.googleEventId,
            );
            events.push(existingById);
          } catch {
            existingById = undefined;
          }
        }

        const exactMatch = findMatchingEvent(events, payload);
        const candidateByContent = findUpdateCandidate(events, payload);

        if (shift.status === "deleted") {
          const deletableEvent =
            existingById ?? exactMatch ?? candidateByContent;
          if (deletableEvent) {
            try {
              await service.deleteEvent(calendarId, deletableEvent.id);
            } catch (deleteError) {
              if (!isDeleteGoneError(deleteError)) {
                throw deleteError;
              }
            }
            summary.deleted += 1;
            const nextEvents = events.filter(
              (event) => event.id !== deletableEvent.id,
            );
            events.splice(0, events.length, ...nextEvents);
            matchedEventIds.add(deletableEvent.id);
            syncedShifts.push({ ...shift, googleEventId: undefined });
            changes.push({
              type: "delete",
              reason: "Shift marked deleted",
              syncShiftKey: shift.shiftUid ?? null,
              date: eventDay(payload.start?.dateTime) || null,
              start: payload.start?.dateTime ?? null,
              end: payload.end?.dateTime ?? null,
              title: payload.summary ?? null,
              location: shift.location ?? null,
            });
          } else {
            summary.noop += 1;
            syncedShifts.push(shift);
            changes.push({
              type: "noop",
              reason: "Deleted shift already absent from calendar",
              syncShiftKey: shift.shiftUid ?? null,
              date: eventDay(payload.start?.dateTime) || null,
              start: payload.start?.dateTime ?? null,
              end: payload.end?.dateTime ?? null,
              title: payload.summary ?? null,
              location: shift.location ?? null,
            });
          }
          continue;
        }

        const updatable = existingById ?? candidateByContent;

        if (updatable) {
          matchedEventIds.add(updatable.id);
          if (isSameEvent(updatable, payload)) {
            summary.noop += 1;
            syncedShifts.push({ ...shift, googleEventId: updatable.id });
            changes.push({
              type: "noop",
              reason: "Fingerprint unchanged",
              syncShiftKey: shift.shiftUid ?? null,
              date: eventDay(payload.start?.dateTime) || null,
              start: payload.start?.dateTime ?? null,
              end: payload.end?.dateTime ?? null,
              title: payload.summary ?? null,
              location: shift.location ?? null,
            });
          } else {
            let updatedEvent: CalendarEvent;
            try {
              updatedEvent = await service.updateEvent(
                calendarId,
                updatable.id,
                shift,
              );
            } catch (updateError) {
              const status = (updateError as { status?: number })?.status;
              if (status === 404 || status === 410) {
                updatedEvent = await service.createEvent(calendarId, shift);
              } else {
                throw updateError;
              }
            }
            summary.updated += 1;
            const index = events.findIndex(
              (event) => event.id === updatable.id,
            );
            if (index >= 0) {
              events[index] = updatedEvent;
            }
            syncedShifts.push({ ...shift, googleEventId: updatedEvent.id });
            matchedEventIds.add(updatedEvent.id);
            changes.push({
              type: "update",
              reason: "Matched existing managed event",
              syncShiftKey: shift.shiftUid ?? null,
              date: eventDay(payload.start?.dateTime) || null,
              start: payload.start?.dateTime ?? null,
              end: payload.end?.dateTime ?? null,
              title: payload.summary ?? null,
              location: shift.location ?? null,
            });
          }
          continue;
        }

        if (exactMatch) {
          summary.noop += 1;
          syncedShifts.push({ ...shift, googleEventId: exactMatch.id });
          matchedEventIds.add(exactMatch.id);
          changes.push({
            type: "noop",
            reason: "Exact event already exists",
            syncShiftKey: shift.shiftUid ?? null,
            date: eventDay(payload.start?.dateTime) || null,
            start: payload.start?.dateTime ?? null,
            end: payload.end?.dateTime ?? null,
            title: payload.summary ?? null,
            location: shift.location ?? null,
          });
          continue;
        }

        const createdEvent = await service.createEvent(calendarId, shift);
        summary.created += 1;
        events.push(createdEvent);
        syncedShifts.push({ ...shift, googleEventId: createdEvent.id });
        matchedEventIds.add(createdEvent.id);
        changes.push({
          type: "create",
          reason: "No existing managed event matched",
          syncShiftKey: shift.shiftUid ?? null,
          date: eventDay(payload.start?.dateTime) || null,
          start: payload.start?.dateTime ?? null,
          end: payload.end?.dateTime ?? null,
          title: payload.summary ?? null,
          location: shift.location ?? null,
        });
      } catch (error) {
        summary.failed += 1;
        syncedShifts.push(shift);
        errors.push({
          shiftId: shift.id ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove stale managed shift events that are no longer present in parsed shifts.
    for (const event of [...events]) {
      if (!isManagedShiftEvent(event)) {
        continue;
      }

      if (matchedEventIds.has(event.id)) {
        continue;
      }

      const key = `${eventDay(event.start?.dateTime)}|${normalizeText(event.summary)}`;
      if (desiredShiftEventKeys.has(key)) {
        continue;
      }

      try {
        await service.deleteEvent(calendarId, event.id);
      } catch (deleteError) {
        if (!isDeleteGoneError(deleteError)) {
          summary.failed += 1;
          errors.push({
            shiftId: null,
            message:
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError),
          });
          continue;
        }
      }

      summary.deleted += 1;
      matchedEventIds.add(event.id);
      changes.push({
        type: "delete",
        reason: "Stale managed event removed",
        syncShiftKey: null,
        date: eventDay(event.start?.dateTime) || null,
        start: event.start?.dateTime ?? null,
        end: event.end?.dateTime ?? null,
        title: event.summary ?? null,
        location: null,
      });
    }

    return { summary, syncedShifts, errors, changes };
  }
}
