import type { ShiftData } from "@/types/shift";
import { buildCalendarDiffPlan } from "@/features/calendar/services/calendarDiff";
import {
  GoogleCalendarAdapter,
  extractEventMetadata,
  type CalendarProviderAdapter,
} from "@/features/calendar/services/googleCalendarAdapter";
import {
  buildShiftSyncKey,
  resolveDateRangeFromShifts,
} from "@/features/calendar/utils/eventFingerprint";
import { buildShiftUidFromShift } from "@/shared/utils/shift-uid";
import type {
  CalendarSyncExecutionResult,
  CalendarSyncOptions,
  CalendarSyncPreviewChange,
  CalendarSyncPreviewResult,
  CalendarSyncRecordRepository,
} from "@/features/calendar/types";

function extractUid(syncShiftKey: string): string {
  const marker = "::uid:";
  const idx = syncShiftKey.indexOf(marker);
  if (idx === -1) {
    return syncShiftKey;
  }
  return syncShiftKey.slice(idx + marker.length);
}

function normalizeShiftIdForRecord(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  return isUuid ? value : null;
}

function normalizeEventText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isMissingGoogleEventError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 404 || status === 410) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("not found") ||
    message.includes("resource has been deleted")
  );
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toHHmm(value: string): string {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function reconcileShiftWithGoogleEvent(
  shift: ShiftData,
  event: {
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  },
): ShiftData {
  const startDateTime = event.start?.dateTime;
  const endDateTime = event.end?.dateTime;

  if (!startDateTime || !endDateTime) {
    return shift;
  }

  return {
    ...shift,
    date: new Date(startDateTime),
    startTime: toHHmm(startDateTime),
    endTime: toHHmm(endDateTime),
    notes: event.summary ?? shift.notes,
    status: shift.status === "deleted" ? "deleted" : "modified",
  };
}

function expandRepositoryRange(range: { start: string; end: string }): {
  start: string;
  end: string;
} {
  return {
    start: addDays(range.start, -2),
    end: addDays(range.end, 2),
  };
}

function withDefaults(options: CalendarSyncOptions): CalendarSyncOptions {
  return {
    ...options,
    removeStaleEvents: options.removeStaleEvents ?? false,
    fullResync: options.fullResync ?? false,
  };
}

function toPreviewChanges(
  actions: Array<{
    type: "create" | "update" | "delete" | "noop";
    reason: string;
    preparedShift: {
      syncShiftKey: string;
      start: string;
      end: string;
      title: string;
      location: string;
    } | null;
    record: {
      syncShiftKey: string;
      syncedStart: string;
      syncedEnd: string;
      syncedTitle: string;
      syncedLocation: string | null;
    } | null;
  }>,
): CalendarSyncPreviewChange[] {
  return actions.map((action) => {
    const prepared = action.preparedShift;
    return {
      type: action.type,
      reason: action.reason,
      syncShiftKey:
        prepared?.syncShiftKey ?? action.record?.syncShiftKey ?? null,
      date:
        prepared?.start?.slice(0, 10) ??
        action.record?.syncedStart?.slice(0, 10) ??
        null,
      start: prepared?.start ?? action.record?.syncedStart ?? null,
      end: prepared?.end ?? action.record?.syncedEnd ?? null,
      title: prepared?.title ?? action.record?.syncedTitle ?? null,
      location: prepared?.location ?? action.record?.syncedLocation ?? null,
    };
  });
}

function logIdentityConsistency(shifts: ShiftData[], userId: string): void {
  const byCanonical = new Map<string, Set<string>>();

  for (const shift of shifts) {
    if (shift.status === "deleted") {
      continue;
    }

    const canonicalUid = buildShiftUidFromShift(shift, userId);
    const uid = shift.shiftUid ?? canonicalUid;
    const existing = byCanonical.get(canonicalUid) ?? new Set<string>();
    existing.add(uid);
    byCanonical.set(canonicalUid, existing);
  }

  for (const [canonicalUid, seen] of byCanonical.entries()) {
    if (seen.size > 1) {
      console.error("[CalendarSync] IDENTITY ERROR: inconsistent shift_uid", {
        canonical_uid: canonicalUid,
        seen_shift_uids: [...seen],
      });
    }
  }
}

export class CalendarSyncService {
  constructor(
    private readonly records: CalendarSyncRecordRepository,
    private readonly adapterFactory: (
      accessToken: string,
    ) => CalendarProviderAdapter = (accessToken) =>
      new GoogleCalendarAdapter(accessToken),
  ) {}

  async preview(input: {
    shifts: ShiftData[];
    accessToken: string;
    options: CalendarSyncOptions;
  }): Promise<CalendarSyncPreviewResult> {
    const options = withDefaults(input.options);
    const range = options.dateRange ?? resolveDateRangeFromShifts(input.shifts);
    const repositoryRange = expandRepositoryRange(range);

    const syncShiftKeys = input.shifts
      .filter((shift) => shift.status !== "deleted")
      .map((shift) => buildShiftSyncKey(shift, options.userId));

    const keyLookup =
      "getRecordsBySyncKeys" in this.records
        ? (
            this.records as CalendarSyncRecordRepository & {
              getRecordsBySyncKeys: CalendarSyncRecordRepository["getRecordsBySyncKeys"];
            }
          ).getRecordsBySyncKeys({
            userId: options.userId,
            provider: options.provider,
            calendarId: options.calendarId,
            syncShiftKeys,
          })
        : Promise.resolve([]);

    const [rangeRecords, keyRecords] = await Promise.all([
      this.records.getRecordsForRange({
        userId: options.userId,
        provider: options.provider,
        calendarId: options.calendarId,
        range: repositoryRange,
      }),
      keyLookup,
    ]);

    const trackedRecordsById = new Map<string, (typeof rangeRecords)[number]>();
    for (const record of [...rangeRecords, ...keyRecords]) {
      trackedRecordsById.set(record.id, record);
    }
    const trackedRecords = [...trackedRecordsById.values()];

    const plan = buildCalendarDiffPlan({
      shifts: input.shifts,
      trackedRecords,
      options: { ...options, dateRange: range },
    });

    const changes = toPreviewChanges(plan.actions);

    return { summary: plan.summary, changes };
  }

  async apply(input: {
    shifts: ShiftData[];
    accessToken: string;
    options: CalendarSyncOptions;
  }): Promise<CalendarSyncExecutionResult> {
    const options = withDefaults(input.options);
    const range = options.dateRange ?? resolveDateRangeFromShifts(input.shifts);
    const repositoryRange = expandRepositoryRange(range);
    const adapter = this.adapterFactory(input.accessToken);

    const syncShiftKeys = input.shifts
      .filter((shift) => shift.status !== "deleted")
      .map((shift) => buildShiftSyncKey(shift, options.userId));

    const keyLookup =
      "getRecordsBySyncKeys" in this.records
        ? (
            this.records as CalendarSyncRecordRepository & {
              getRecordsBySyncKeys: CalendarSyncRecordRepository["getRecordsBySyncKeys"];
            }
          ).getRecordsBySyncKeys({
            userId: options.userId,
            provider: options.provider,
            calendarId: options.calendarId,
            syncShiftKeys,
          })
        : Promise.resolve([]);

    const [rangeRecords, keyRecords] = await Promise.all([
      this.records.getRecordsForRange({
        userId: options.userId,
        provider: options.provider,
        calendarId: options.calendarId,
        range: repositoryRange,
      }),
      keyLookup,
    ]);

    const trackedRecordsById = new Map<string, (typeof rangeRecords)[number]>();
    for (const record of [...rangeRecords, ...keyRecords]) {
      trackedRecordsById.set(record.id, record);
    }
    const trackedRecords = [...trackedRecordsById.values()];

    let shiftsForPlan = [...input.shifts];

    if (adapter.listEvents) {
      try {
        const events = await adapter.listEvents(options.calendarId, {
          timeMin: `${range.start}T00:00:00Z`,
          timeMax: `${range.end}T23:59:59Z`,
        });
        const eventsById = new Map(events.map((event) => [event.id, event]));

        shiftsForPlan = shiftsForPlan.map((shift) => {
          const eventId = shift.googleEventId;
          if (!eventId) {
            return shift;
          }

          const googleEvent = eventsById.get(eventId);
          if (!googleEvent) {
            // Event removed in Google: reflect this in ShiftSync as deleted.
            return {
              ...shift,
              googleEventId: undefined,
              status: "deleted",
            };
          }

          return reconcileShiftWithGoogleEvent(shift, googleEvent);
        });
      } catch {
        // Keep standard behavior if event listing fails.
      }
    }

    const plan = buildCalendarDiffPlan({
      shifts: shiftsForPlan,
      trackedRecords,
      options: { ...options, dateRange: range },
    });
    const changes = toPreviewChanges(plan.actions);
    logIdentityConsistency(shiftsForPlan, options.userId);

    console.info("[CalendarSync][PreSync][DBShifts]", {
      user_id: options.userId,
      rows: shiftsForPlan.map((shift) => ({
        shift_uid:
          shift.shiftUid ?? buildShiftUidFromShift(shift, options.userId),
        google_event_id: shift.googleEventId ?? null,
        date: new Date(shift.date).toISOString().slice(0, 10),
        start_time: shift.startTime,
        end_time: shift.endTime,
      })),
    });

    console.info("[CalendarSync][PreSync][TrackedRecords]", {
      user_id: options.userId,
      rows: trackedRecords.map((record) => ({
        shift_uid: extractUid(record.syncShiftKey),
        google_event_id: record.externalEventId,
      })),
    });

    if (adapter.listEvents) {
      try {
        const events = await adapter.listEvents(options.calendarId, {
          timeMin: `${range.start}T00:00:00Z`,
          timeMax: `${range.end}T23:59:59Z`,
        });
        console.info("[CalendarSync][PreSync][GoogleEvents]", {
          calendar_id: options.calendarId,
          rows: events.map((event) => ({
            id: event.id,
            start_time: event.start?.dateTime ?? null,
          })),
        });
      } catch (listErr) {
        console.warn(
          "[CalendarSync][PreSync][GoogleEvents] failed to list events",
          {
            message:
              listErr instanceof Error ? listErr.message : String(listErr),
          },
        );
      }
    }

    const googleEventsByIdentity = new Map<string, string>();
    const googleEventIdsInRange = new Set<string>();
    let listedGoogleEvents = false;
    if (adapter.listEvents) {
      try {
        const events = await adapter.listEvents(options.calendarId, {
          timeMin: `${range.start}T00:00:00Z`,
          timeMax: `${range.end}T23:59:59Z`,
        });
        listedGoogleEvents = true;
        for (const event of events) {
          googleEventIdsInRange.add(event.id);
          const key = [
            normalizeEventText(event.summary),
            event.start?.dateTime ?? "",
            event.end?.dateTime ?? "",
          ].join("|");
          googleEventsByIdentity.set(key, event.id);
        }
      } catch {
        // Best effort bridge only.
      }
    }

    const summary = { ...plan.summary };
    const errors: CalendarSyncExecutionResult["errors"] = [];
    const syncedShifts: ShiftData[] = [];

    const byId = new Map(shiftsForPlan.map((shift) => [shift.id, shift]));

    const createdBySyncShiftKey = new Set<string>();

    for (const action of plan.actions) {
      try {
        if (action.type === "noop") {
          const uid =
            action.preparedShift?.syncShiftKey ??
            action.record?.syncShiftKey ??
            "unknown";

          if (
            listedGoogleEvents &&
            action.preparedShift &&
            action.record &&
            !googleEventIdsInRange.has(action.record.externalEventId)
          ) {
            console.warn(
              "[CalendarSync] NOOP RECOVERY: tracked event missing, recreating",
              {
                shift_uid: action.preparedShift.syncShiftKey,
                previous_google_event_id: action.record.externalEventId,
              },
            );

            const recreated = await adapter.createEvent(
              options.calendarId,
              action.preparedShift.shift,
            );

            const metadata = extractEventMetadata(action.preparedShift.shift);
            await this.records.upsertRecord({
              userId: options.userId,
              provider: options.provider,
              calendarId: options.calendarId,
              shiftId: normalizeShiftIdForRecord(action.preparedShift.shiftId),
              syncShiftKey: action.preparedShift.syncShiftKey,
              externalEventId: recreated.id,
              shiftFingerprint: action.preparedShift.fingerprint,
              syncedStart: metadata.start,
              syncedEnd: metadata.end,
              syncedTitle: metadata.title,
              syncedDescription: metadata.description,
              syncedLocation: metadata.location,
              syncStatus: "ok",
            });

            syncedShifts.push({
              ...action.preparedShift.shift,
              googleEventId: recreated.id,
            });
            summary.noop -= 1;
            summary.updated += 1;
            continue;
          }

          console.info("[CalendarSync] SKIP", {
            shift_uid: uid,
            reason: action.reason,
          });
          if (action.preparedShift?.shift) {
            syncedShifts.push(action.preparedShift.shift);
          }
          continue;
        }

        if (action.type === "create" && action.preparedShift) {
          console.info("[CalendarSync] CREATE", {
            shift_uid: action.preparedShift.syncShiftKey,
            reason: action.reason,
          });

          if (createdBySyncShiftKey.has(action.preparedShift.syncShiftKey)) {
            console.error(
              "[CalendarSync] DUPLICATE DETECTED: shift_uid recreated",
              {
                shift_uid: action.preparedShift.syncShiftKey,
              },
            );
          }

          createdBySyncShiftKey.add(action.preparedShift.syncShiftKey);

          if (action.preparedShift.shift.googleEventId) {
            const guardedEventId = action.preparedShift.shift.googleEventId;
            console.warn(
              "[CalendarSync] CREATE GUARD: google_event_id exists, forcing UPDATE",
              {
                shift_uid: action.preparedShift.syncShiftKey,
                google_event_id: guardedEventId,
              },
            );

            let updated: Awaited<ReturnType<typeof adapter.updateEvent>>;
            try {
              updated = await adapter.updateEvent(
                options.calendarId,
                guardedEventId,
                action.preparedShift.shift,
              );
            } catch (updateErr) {
              if (!isMissingGoogleEventError(updateErr)) {
                throw updateErr;
              }

              console.warn(
                "[CalendarSync] UPDATE RECOVERY: target event missing, recreating",
                {
                  shift_uid: action.preparedShift.syncShiftKey,
                  previous_google_event_id: guardedEventId,
                },
              );

              updated = await adapter.createEvent(
                options.calendarId,
                action.preparedShift.shift,
              );
            }

            const metadata = extractEventMetadata(action.preparedShift.shift);
            await this.records.upsertRecord({
              userId: options.userId,
              provider: options.provider,
              calendarId: options.calendarId,
              shiftId: normalizeShiftIdForRecord(action.preparedShift.shiftId),
              syncShiftKey: action.preparedShift.syncShiftKey,
              externalEventId: updated.id,
              shiftFingerprint: action.preparedShift.fingerprint,
              syncedStart: metadata.start,
              syncedEnd: metadata.end,
              syncedTitle: metadata.title,
              syncedDescription: metadata.description,
              syncedLocation: metadata.location,
              syncStatus: "ok",
            });

            syncedShifts.push({
              ...action.preparedShift.shift,
              googleEventId: updated.id,
            });
            summary.created -= 1;
            summary.updated += 1;
            continue;
          }

          const createIdentity = [
            normalizeEventText(action.preparedShift.title),
            action.preparedShift.start,
            action.preparedShift.end,
          ].join("|");
          const existingGoogleEventId =
            googleEventsByIdentity.get(createIdentity);
          if (existingGoogleEventId) {
            console.warn(
              "[CalendarSync] CREATE BRIDGE: existing Google event found, linking instead of creating",
              {
                shift_uid: action.preparedShift.syncShiftKey,
                google_event_id: existingGoogleEventId,
              },
            );

            const metadata = extractEventMetadata(action.preparedShift.shift);
            await this.records.upsertRecord({
              userId: options.userId,
              provider: options.provider,
              calendarId: options.calendarId,
              shiftId: normalizeShiftIdForRecord(action.preparedShift.shiftId),
              syncShiftKey: action.preparedShift.syncShiftKey,
              externalEventId: existingGoogleEventId,
              shiftFingerprint: action.preparedShift.fingerprint,
              syncedStart: metadata.start,
              syncedEnd: metadata.end,
              syncedTitle: metadata.title,
              syncedDescription: metadata.description,
              syncedLocation: metadata.location,
              syncStatus: "ok",
            });

            syncedShifts.push({
              ...action.preparedShift.shift,
              googleEventId: existingGoogleEventId,
            });
            summary.created -= 1;
            summary.updated += 1;
            continue;
          }

          const created = await adapter.createEvent(
            options.calendarId,
            action.preparedShift.shift,
          );

          const metadata = extractEventMetadata(action.preparedShift.shift);
          try {
            await this.records.upsertRecord({
              userId: options.userId,
              provider: options.provider,
              calendarId: options.calendarId,
              shiftId: normalizeShiftIdForRecord(action.preparedShift.shiftId),
              syncShiftKey: action.preparedShift.syncShiftKey,
              externalEventId: created.id,
              shiftFingerprint: action.preparedShift.fingerprint,
              syncedStart: metadata.start,
              syncedEnd: metadata.end,
              syncedTitle: metadata.title,
              syncedDescription: metadata.description,
              syncedLocation: metadata.location,
              syncStatus: "ok",
            });
          } catch (persistErr) {
            try {
              await adapter.deleteEvent(options.calendarId, created.id);
            } catch {
              // Best effort rollback only.
            }
            throw new Error(
              `Create rollback executed after persistence failure for shift_uid=${action.preparedShift.syncShiftKey}: ${
                persistErr instanceof Error
                  ? persistErr.message
                  : String(persistErr)
              }`,
            );
          }

          syncedShifts.push({
            ...action.preparedShift.shift,
            googleEventId: created.id,
          });
          continue;
        }

        if (action.type === "update" && action.preparedShift) {
          console.info("[CalendarSync] UPDATE", {
            shift_uid: action.preparedShift.syncShiftKey,
            reason: action.reason,
          });
          // action.record may be null for the bridge case (event exists in Google
          // Calendar but was created before Phase 3 tracking existed).
          const targetEventId =
            action.record?.externalEventId ??
            action.preparedShift.shift.googleEventId;

          if (!targetEventId) {
            console.error(
              "[CalendarSync] UPDATE FAILED: existing shift not matched",
              {
                shift_uid: action.preparedShift.syncShiftKey,
              },
            );
            throw new Error("Missing target event id for update action");
          }

          let updated: Awaited<ReturnType<typeof adapter.updateEvent>>;
          try {
            updated = await adapter.updateEvent(
              options.calendarId,
              targetEventId,
              action.preparedShift.shift,
            );
          } catch (updateErr) {
            if (!isMissingGoogleEventError(updateErr)) {
              throw updateErr;
            }

            console.warn(
              "[CalendarSync] UPDATE RECOVERY: target event missing, recreating",
              {
                shift_uid: action.preparedShift.syncShiftKey,
                previous_google_event_id: targetEventId,
              },
            );

            updated = await adapter.createEvent(
              options.calendarId,
              action.preparedShift.shift,
            );
          }

          const metadata = extractEventMetadata(action.preparedShift.shift);
          await this.records.upsertRecord({
            userId: options.userId,
            provider: options.provider,
            calendarId: options.calendarId,
            shiftId: normalizeShiftIdForRecord(action.preparedShift.shiftId),
            syncShiftKey: action.preparedShift.syncShiftKey,
            externalEventId: updated.id,
            shiftFingerprint: action.preparedShift.fingerprint,
            syncedStart: metadata.start,
            syncedEnd: metadata.end,
            syncedTitle: metadata.title,
            syncedDescription: metadata.description,
            syncedLocation: metadata.location,
            syncStatus: "ok",
          });

          syncedShifts.push({
            ...action.preparedShift.shift,
            googleEventId: updated.id,
          });
          continue;
        }

        if (action.type === "delete") {
          const uid =
            action.preparedShift?.syncShiftKey ??
            action.record?.syncShiftKey ??
            "unknown";
          console.info("[CalendarSync] DELETE", {
            shift_uid: uid,
            reason: action.reason,
          });
          const targetEventId =
            action.record?.externalEventId ??
            action.preparedShift?.shift.googleEventId;

          if (targetEventId) {
            try {
              await adapter.deleteEvent(options.calendarId, targetEventId);
            } catch (deleteErr) {
              const httpStatus = (deleteErr as { status?: number })?.status;
              // 404 / 410 means the event is already gone — still clean up record.
              if (httpStatus !== 404 && httpStatus !== 410) {
                console.error(
                  "[CalendarSync] DELETE FAILED: orphan calendar event",
                  {
                    shift_uid: uid,
                    external_event_id: targetEventId,
                  },
                );
                throw deleteErr;
              }
            }
          } else {
            console.error(
              "[CalendarSync] DELETE FAILED: orphan calendar event",
              {
                shift_uid: uid,
                external_event_id: null,
              },
            );
          }

          if (action.record) {
            await this.records.deleteRecord(action.record.id);
          }
          continue;
        }
      } catch (error) {
        summary.failed += 1;
        if (action.type === "create") summary.created -= 1;
        if (action.type === "update") summary.updated -= 1;
        if (action.type === "delete") summary.deleted -= 1;

        if (action.record) {
          await this.records.markFailed(action.record.id, String(error));
        }

        errors.push({
          action: action.type,
          reason: action.reason,
          message: error instanceof Error ? error.message : String(error),
          shiftId: action.preparedShift?.shift?.id ?? null,
          externalEventId: action.record?.externalEventId ?? null,
        });

        const fallback =
          action.preparedShift?.shift ??
          (action.record?.shiftId
            ? byId.get(action.record.shiftId)
            : undefined);
        if (fallback) {
          syncedShifts.push(fallback);
        }
      }
    }

    for (const original of shiftsForPlan) {
      const alreadyIncluded = syncedShifts.some(
        (shift) => shift.id === original.id,
      );
      if (!alreadyIncluded) {
        syncedShifts.push(original);
      }
    }

    const expectedMaterialOps = changes.filter(
      (change) => change.type !== "noop",
    ).length;
    const observedOps = summary.created + summary.updated + summary.deleted;
    if (expectedMaterialOps > 0 && observedOps === 0) {
      console.error("SYNC ERROR: No operations detected but changes expected", {
        expected_operations: expectedMaterialOps,
      });
    }

    return {
      summary,
      syncedShifts,
      errors,
      changes,
    };
  }
}
