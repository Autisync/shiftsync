import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
const SCHEDULER_SECRET = Deno.env.get("CALENDAR_SYNC_SCHEDULER_SECRET") || "";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SyncAction =
  | "connect"
  | "status"
  | "update_connection"
  | "disconnect"
  | "preview"
  | "apply"
  | "trigger"
  | "pull"
  | "scheduled_poll";

interface SyncRequest {
  action: SyncAction;
  userId?: string;
  calendarId?: string;
  dateRange?: { start: string; end: string };
  fullResync?: boolean;
  removeStaleEvents?: boolean;
  code?: string;
  redirectUri?: string;
  defaultCalendarId?: string | null;
  syncEnabled?: boolean;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: "google";
  google_email: string | null;
  default_calendar_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

interface ShiftRow {
  id: string;
  user_id: string;
  shift_uid: string | null;
  date: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  role: string | null;
  status: "active" | "deleted";
  google_event_id: string | null;
}

interface SyncRecordRow {
  id: string;
  shift_id: string | null;
  sync_shift_key: string;
  external_event_id: string;
  shift_fingerprint: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function addDays(dateOnly: string, days: number): string {
  const dt = new Date(`${dateOnly}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 14);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 60);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function toIsoFromDateAndTime(dateOnly: string, sourceIso: string): string {
  const source = new Date(sourceIso);
  const dt = new Date(`${dateOnly}T00:00:00.000Z`);
  dt.setUTCHours(source.getUTCHours(), source.getUTCMinutes(), 0, 0);
  return dt.toISOString();
}

function fingerprintShift(shift: ShiftRow): string {
  return [
    shift.date,
    new Date(shift.starts_at).toISOString(),
    new Date(shift.ends_at).toISOString(),
    shift.location ?? "",
  ].join("|");
}

function buildSummaryFromShift(shift: ShiftRow): string {
  return shift.role?.trim() ? `Shift - ${shift.role.trim()}` : "Shift";
}

function buildEventPayload(shift: ShiftRow): Record<string, unknown> {
  return {
    summary: buildSummaryFromShift(shift),
    location: shift.location ?? undefined,
    start: {
      dateTime: toIsoFromDateAndTime(shift.date, shift.starts_at),
      timeZone: "Europe/Lisbon",
    },
    end: {
      dateTime: toIsoFromDateAndTime(shift.date, shift.ends_at),
      timeZone: "Europe/Lisbon",
    },
  };
}

function safeConnectionStatus(connection: ConnectionRow | null): {
  connected: boolean;
  provider: "google";
  googleEmail: string | null;
  defaultCalendarId: string | null;
  syncEnabled: boolean;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
} {
  return {
    connected: Boolean(connection),
    provider: "google",
    googleEmail: connection?.google_email ?? null,
    defaultCalendarId: connection?.default_calendar_id ?? null,
    syncEnabled: connection?.sync_enabled ?? false,
    tokenExpiresAt: connection?.token_expires_at ?? null,
    lastSyncedAt: connection?.last_synced_at ?? null,
    lastSyncStatus: connection?.last_sync_status ?? null,
    lastSyncError: connection?.last_sync_error ?? null,
  };
}

async function resolveUserId(req: Request, requestedUserId?: string): Promise<string> {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    throw new Error("Missing Authorization token.");
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Invalid auth token for calendar sync request.");
  }

  if (requestedUserId && requestedUserId !== data.user.id) {
    throw new Error("Cannot act on another user connection.");
  }

  return data.user.id;
}

async function getConnection(userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("external_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ConnectionRow | null) ?? null;
}

async function upsertConnection(input: {
  userId: string;
  googleEmail?: string | null;
  defaultCalendarId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  syncEnabled?: boolean;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastSyncedAt?: string | null;
}): Promise<ConnectionRow> {
  const payload = {
    user_id: input.userId,
    provider: "google",
    google_email: input.googleEmail ?? null,
    default_calendar_id: input.defaultCalendarId ?? null,
    access_token: input.accessToken ?? null,
    refresh_token: input.refreshToken ?? null,
    token_expires_at: input.tokenExpiresAt ?? null,
    sync_enabled: input.syncEnabled ?? true,
    last_sync_status: input.lastSyncStatus ?? null,
    last_sync_error: input.lastSyncError ?? null,
    last_synced_at: input.lastSyncedAt ?? null,
  };

  const { data, error } = await supabase
    .from("external_calendar_connections")
    .upsert(payload, { onConflict: "user_id,provider" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to persist calendar connection.");
  }

  return data as ConnectionRow;
}

async function exchangeCodeForToken(input: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials are not configured on backend.");
  }

  const body = new URLSearchParams({
    code: input.code,
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const jsonBody = await response.json();
  if (!response.ok) {
    throw new Error(jsonBody?.error_description || jsonBody?.error || "Failed to exchange Google OAuth code.");
  }

  const expiresIn = Number(jsonBody.expires_in || 0);
  const expiresAt = expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  return {
    accessToken: String(jsonBody.access_token || ""),
    refreshToken:
      typeof jsonBody.refresh_token === "string" && jsonBody.refresh_token
        ? jsonBody.refresh_token
        : null,
    expiresAt,
  };
}

async function refreshAccessToken(connection: ConnectionRow): Promise<{
  connection: ConnectionRow;
  accessToken: string;
}> {
  const expiryMs = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;

  if (connection.access_token && expiryMs > Date.now() + 60_000) {
    return {
      connection,
      accessToken: connection.access_token,
    };
  }

  if (!connection.refresh_token) {
    if (connection.access_token) {
      return { connection, accessToken: connection.access_token };
    }
    throw new Error("No Google refresh token available for server-side sync.");
  }

  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials are not configured on backend.");
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const jsonBody = await response.json();

  if (!response.ok) {
    throw new Error(jsonBody?.error_description || jsonBody?.error || "Google token refresh failed.");
  }

  const nextAccessToken = String(jsonBody.access_token || "");
  const nextRefreshToken =
    typeof jsonBody.refresh_token === "string" && jsonBody.refresh_token
      ? jsonBody.refresh_token
      : connection.refresh_token;
  const expiresIn = Number(jsonBody.expires_in || 0);
  const tokenExpiresAt = expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : connection.token_expires_at;

  const updated = await upsertConnection({
    userId: connection.user_id,
    googleEmail: connection.google_email,
    defaultCalendarId: connection.default_calendar_id,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiresAt,
    syncEnabled: connection.sync_enabled,
    lastSyncStatus: connection.last_sync_status,
    lastSyncError: connection.last_sync_error,
    lastSyncedAt: connection.last_synced_at,
  });

  return {
    connection: updated,
    accessToken: nextAccessToken,
  };
}

async function googleFetch<T>(input: {
  accessToken: string;
  endpoint: string;
  method?: string;
  body?: unknown;
}): Promise<T> {
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}${input.endpoint}`, {
    method: input.method || "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  if (!response.ok) {
    const msg =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as Record<string, unknown>).error)
        : typeof parsed === "string"
          ? parsed
          : response.statusText;
    throw new Error(`Google API ${response.status}: ${msg}`);
  }

  return parsed as T;
}

async function listGoogleEvents(input: {
  accessToken: string;
  calendarId: string;
  range: { start: string; end: string };
}): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: `${input.range.start}T00:00:00Z`,
    timeMax: `${input.range.end}T23:59:59Z`,
    singleEvents: "true",
    orderBy: "startTime",
  });

  const data = await googleFetch<{ items?: GoogleEvent[] }>({
    accessToken: input.accessToken,
    endpoint: `/calendars/${encodeURIComponent(input.calendarId)}/events?${params}`,
  });

  return data.items || [];
}

async function createGoogleEvent(input: {
  accessToken: string;
  calendarId: string;
  shift: ShiftRow;
}): Promise<GoogleEvent> {
  return googleFetch<GoogleEvent>({
    accessToken: input.accessToken,
    endpoint: `/calendars/${encodeURIComponent(input.calendarId)}/events`,
    method: "POST",
    body: buildEventPayload(input.shift),
  });
}

async function updateGoogleEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  shift: ShiftRow;
}): Promise<GoogleEvent> {
  return googleFetch<GoogleEvent>({
    accessToken: input.accessToken,
    endpoint: `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    method: "PUT",
    body: buildEventPayload(input.shift),
  });
}

async function deleteGoogleEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  try {
    await googleFetch({
      accessToken: input.accessToken,
      endpoint: `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      method: "DELETE",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("404") || message.includes("410") || message.includes("deleted")) {
      return;
    }
    throw error;
  }
}

async function loadShifts(input: {
  userId: string;
  range: { start: string; end: string };
}): Promise<ShiftRow[]> {
  const { data, error } = await supabase
    .from("shifts")
    .select("id,user_id,shift_uid,date,starts_at,ends_at,location,role,status,google_event_id")
    .eq("user_id", input.userId)
    .gte("date", input.range.start)
    .lte("date", input.range.end)
    .or("status.eq.active,status.eq.deleted")
    .order("date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as ShiftRow[] | null) ?? [];
}

async function loadRecords(input: {
  userId: string;
  calendarId: string;
  range: { start: string; end: string };
}): Promise<SyncRecordRow[]> {
  const { data, error } = await supabase
    .from("calendar_sync_records")
    .select("id,shift_id,sync_shift_key,external_event_id,shift_fingerprint")
    .eq("user_id", input.userId)
    .eq("provider", "google")
    .eq("calendar_id", input.calendarId)
    .gte("synced_start", `${addDays(input.range.start, -2)}T00:00:00Z`)
    .lte("synced_start", `${addDays(input.range.end, 2)}T23:59:59Z`);

  if (error) {
    throw new Error(error.message);
  }

  return (data as SyncRecordRow[] | null) ?? [];
}

async function persistShiftUpdates(input: {
  userId: string;
  updates: Array<Partial<ShiftRow> & { id: string }>;
  source: "google" | "system";
  dryRun: boolean;
}): Promise<void> {
  if (input.dryRun || input.updates.length === 0) {
    return;
  }

  for (const update of input.updates) {
    const payload: Record<string, unknown> = {
      google_event_id: update.google_event_id ?? null,
      date: update.date,
      starts_at: update.starts_at,
      ends_at: update.ends_at,
      location: update.location ?? null,
      status: update.status,
      last_calendar_synced_at: new Date().toISOString(),
      last_modified_source: input.source,
      last_modified_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("id", update.id)
      .eq("user_id", input.userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function upsertRecord(input: {
  userId: string;
  calendarId: string;
  shift: ShiftRow;
  syncShiftKey: string;
  event: GoogleEvent;
  dryRun: boolean;
}): Promise<void> {
  if (input.dryRun) {
    return;
  }

  const payload = {
    user_id: input.userId,
    provider: "google",
    calendar_id: input.calendarId,
    shift_id: input.shift.id,
    sync_shift_key: input.syncShiftKey,
    external_event_id: input.event.id,
    shift_fingerprint: fingerprintShift(input.shift),
    synced_start: input.event.start?.dateTime || toIsoFromDateAndTime(input.shift.date, input.shift.starts_at),
    synced_end: input.event.end?.dateTime || toIsoFromDateAndTime(input.shift.date, input.shift.ends_at),
    synced_title: input.event.summary || buildSummaryFromShift(input.shift),
    synced_description: null,
    synced_location: input.event.location || input.shift.location || null,
    sync_status: "ok",
    last_error: null,
    last_synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("calendar_sync_records")
    .upsert(payload, { onConflict: "user_id,provider,calendar_id,sync_shift_key" });

  if (error) {
    throw new Error(error.message);
  }
}

async function deleteRecordBySyncKey(input: {
  userId: string;
  calendarId: string;
  syncShiftKey: string;
  dryRun: boolean;
}): Promise<void> {
  if (input.dryRun) {
    return;
  }

  const { error } = await supabase
    .from("calendar_sync_records")
    .delete()
    .eq("user_id", input.userId)
    .eq("provider", "google")
    .eq("calendar_id", input.calendarId)
    .eq("sync_shift_key", input.syncShiftKey);

  if (error) {
    throw new Error(error.message);
  }
}

async function runSyncForUser(input: {
  userId: string;
  calendarId: string;
  dateRange: { start: string; end: string };
  dryRun: boolean;
  pullOnly: boolean;
}): Promise<{
  summary: {
    created: number;
    updated: number;
    deleted: number;
    noop: number;
    failed: number;
    updatedFromGoogle: number;
  };
  changes: Array<{
    type: "create" | "update" | "delete" | "noop";
    reason: string;
    syncShiftKey: string | null;
    date: string | null;
    start: string | null;
    end: string | null;
    title: string | null;
    location: string | null;
  }>;
  syncedShifts: Array<{
    id: string;
    shiftUid: string | null;
    googleEventId: string | null;
  }>;
  errors: Array<{ shiftId: string | null; message: string }>;
}> {
  const connection = await getConnection(input.userId);
  if (!connection || !connection.sync_enabled) {
    throw new Error("Calendar sync connection missing or disabled.");
  }

  const tokenState = await refreshAccessToken(connection);
  const shifts = await loadShifts({ userId: input.userId, range: input.dateRange });
  const records = await loadRecords({
    userId: input.userId,
    calendarId: input.calendarId,
    range: input.dateRange,
  });
  const events = await listGoogleEvents({
    accessToken: tokenState.accessToken,
    calendarId: input.calendarId,
    range: input.dateRange,
  });

  const eventsById = new Map(events.map((event) => [event.id, event]));
  const eventsByIdentity = new Map<string, GoogleEvent>();
  for (const event of events) {
    const key = [
      (event.summary || "").trim().toLowerCase(),
      event.start?.dateTime || "",
      event.end?.dateTime || "",
    ].join("|");
    eventsByIdentity.set(key, event);
  }

  const recordsBySyncKey = new Map(records.map((record) => [record.sync_shift_key, record]));

  const summary = {
    created: 0,
    updated: 0,
    deleted: 0,
    noop: 0,
    failed: 0,
    updatedFromGoogle: 0,
  };

  const changes: Array<{
    type: "create" | "update" | "delete" | "noop";
    reason: string;
    syncShiftKey: string | null;
    date: string | null;
    start: string | null;
    end: string | null;
    title: string | null;
    location: string | null;
  }> = [];
  const errors: Array<{ shiftId: string | null; message: string }> = [];

  const pullUpdates: Array<Partial<ShiftRow> & { id: string }> = [];

  for (const shift of shifts) {
    if (shift.status === "deleted") {
      continue;
    }

    if (!shift.google_event_id) {
      continue;
    }

    const event = eventsById.get(shift.google_event_id);
    if (!event) {
      summary.updatedFromGoogle += 1;
      pullUpdates.push({
        id: shift.id,
        google_event_id: null,
        status: shift.status,
        date: shift.date,
        starts_at: shift.starts_at,
        ends_at: shift.ends_at,
        location: shift.location,
      });
      continue;
    }

    const nextStart = event.start?.dateTime;
    const nextEnd = event.end?.dateTime;
    const nextLocation = event.location ?? shift.location;

    if (!nextStart || !nextEnd) {
      continue;
    }

    const startChanged = new Date(nextStart).getTime() !== new Date(shift.starts_at).getTime();
    const endChanged = new Date(nextEnd).getTime() !== new Date(shift.ends_at).getTime();
    const locationChanged = (shift.location ?? "") !== (nextLocation ?? "");

    if (!startChanged && !endChanged && !locationChanged) {
      continue;
    }

    summary.updatedFromGoogle += 1;
    pullUpdates.push({
      id: shift.id,
      google_event_id: shift.google_event_id,
      status: shift.status,
      date: nextStart.slice(0, 10),
      starts_at: nextStart,
      ends_at: nextEnd,
      location: nextLocation,
    });
  }

  await persistShiftUpdates({
    userId: input.userId,
    updates: pullUpdates,
    source: "google",
    dryRun: input.dryRun,
  });

  const effectiveShiftMap = new Map<string, ShiftRow>();
  for (const shift of shifts) {
    effectiveShiftMap.set(shift.id, shift);
  }
  for (const update of pullUpdates) {
    const current = effectiveShiftMap.get(update.id);
    if (!current) continue;
    effectiveShiftMap.set(update.id, {
      ...current,
      date: (update.date as string) || current.date,
      starts_at: (update.starts_at as string) || current.starts_at,
      ends_at: (update.ends_at as string) || current.ends_at,
      location: (update.location as string | null | undefined) ?? current.location,
      google_event_id: (update.google_event_id as string | null | undefined) ?? current.google_event_id,
    });
  }

  if (!input.pullOnly) {
    for (const shift of effectiveShiftMap.values()) {
      const syncShiftKey = shift.shift_uid || `shift:${shift.id}`;
      const tracked = recordsBySyncKey.get(syncShiftKey);

      try {
        if (shift.status === "deleted") {
          const eventId = shift.google_event_id || tracked?.external_event_id || null;
          if (eventId) {
            await deleteGoogleEvent({
              accessToken: tokenState.accessToken,
              calendarId: input.calendarId,
              eventId,
            });
            summary.deleted += 1;
            changes.push({
              type: "delete",
              reason: "Shift marked deleted",
              syncShiftKey,
              date: shift.date,
              start: shift.starts_at,
              end: shift.ends_at,
              title: buildSummaryFromShift(shift),
              location: shift.location,
            });
          } else {
            summary.noop += 1;
            changes.push({
              type: "noop",
              reason: "Deleted shift already not linked",
              syncShiftKey,
              date: shift.date,
              start: shift.starts_at,
              end: shift.ends_at,
              title: buildSummaryFromShift(shift),
              location: shift.location,
            });
          }

          await deleteRecordBySyncKey({
            userId: input.userId,
            calendarId: input.calendarId,
            syncShiftKey,
            dryRun: input.dryRun,
          });

          if (shift.google_event_id) {
            await persistShiftUpdates({
              userId: input.userId,
              dryRun: input.dryRun,
              source: "system",
              updates: [
                {
                  id: shift.id,
                  google_event_id: null,
                  date: shift.date,
                  starts_at: shift.starts_at,
                  ends_at: shift.ends_at,
                  location: shift.location,
                  status: shift.status,
                },
              ],
            });
          }

          continue;
        }

        const targetEventId = shift.google_event_id || tracked?.external_event_id || null;
        const payload = buildEventPayload(shift);
        const identityKey = [
          buildSummaryFromShift(shift).trim().toLowerCase(),
          String((payload.start as { dateTime: string }).dateTime || ""),
          String((payload.end as { dateTime: string }).dateTime || ""),
        ].join("|");

        if (!targetEventId) {
          const matched = eventsByIdentity.get(identityKey);
          if (matched) {
            summary.updated += 1;
            changes.push({
              type: "update",
              reason: "Matched existing Google event by identity",
              syncShiftKey,
              date: shift.date,
              start: shift.starts_at,
              end: shift.ends_at,
              title: buildSummaryFromShift(shift),
              location: shift.location,
            });

            await upsertRecord({
              userId: input.userId,
              calendarId: input.calendarId,
              shift,
              syncShiftKey,
              event: matched,
              dryRun: input.dryRun,
            });
            await persistShiftUpdates({
              userId: input.userId,
              dryRun: input.dryRun,
              source: "system",
              updates: [
                {
                  id: shift.id,
                  google_event_id: matched.id,
                  date: shift.date,
                  starts_at: shift.starts_at,
                  ends_at: shift.ends_at,
                  location: shift.location,
                  status: shift.status,
                },
              ],
            });
          } else {
            const created = input.dryRun
              ? ({ id: `preview-${shift.id}` } as GoogleEvent)
              : await createGoogleEvent({
                  accessToken: tokenState.accessToken,
                  calendarId: input.calendarId,
                  shift,
                });

            summary.created += 1;
            changes.push({
              type: "create",
              reason: "No linked Google event",
              syncShiftKey,
              date: shift.date,
              start: shift.starts_at,
              end: shift.ends_at,
              title: buildSummaryFromShift(shift),
              location: shift.location,
            });

            await upsertRecord({
              userId: input.userId,
              calendarId: input.calendarId,
              shift,
              syncShiftKey,
              event: created,
              dryRun: input.dryRun,
            });

            await persistShiftUpdates({
              userId: input.userId,
              dryRun: input.dryRun,
              source: "system",
              updates: [
                {
                  id: shift.id,
                  google_event_id: created.id,
                  date: shift.date,
                  starts_at: shift.starts_at,
                  ends_at: shift.ends_at,
                  location: shift.location,
                  status: shift.status,
                },
              ],
            });
          }

          continue;
        }

        const existing = eventsById.get(targetEventId);
        if (!existing) {
          const recreated = input.dryRun
            ? ({ id: targetEventId } as GoogleEvent)
            : await createGoogleEvent({
                accessToken: tokenState.accessToken,
                calendarId: input.calendarId,
                shift,
              });

          summary.updated += 1;
          changes.push({
            type: "update",
            reason: "Tracked Google event missing; recreated",
            syncShiftKey,
            date: shift.date,
            start: shift.starts_at,
            end: shift.ends_at,
            title: buildSummaryFromShift(shift),
            location: shift.location,
          });

          await upsertRecord({
            userId: input.userId,
            calendarId: input.calendarId,
            shift,
            syncShiftKey,
            event: recreated,
            dryRun: input.dryRun,
          });

          await persistShiftUpdates({
            userId: input.userId,
            dryRun: input.dryRun,
            source: "system",
            updates: [
              {
                id: shift.id,
                google_event_id: recreated.id,
                date: shift.date,
                starts_at: shift.starts_at,
                ends_at: shift.ends_at,
                location: shift.location,
                status: shift.status,
              },
            ],
          });

          continue;
        }

        const shouldUpdate =
          (existing.start?.dateTime || "") !==
            String((payload.start as { dateTime: string }).dateTime || "") ||
          (existing.end?.dateTime || "") !==
            String((payload.end as { dateTime: string }).dateTime || "") ||
          (existing.location || "") !== (shift.location || "") ||
          (existing.summary || "") !== buildSummaryFromShift(shift);

        if (!shouldUpdate) {
          summary.noop += 1;
          changes.push({
            type: "noop",
            reason: "Fingerprint unchanged",
            syncShiftKey,
            date: shift.date,
            start: shift.starts_at,
            end: shift.ends_at,
            title: buildSummaryFromShift(shift),
            location: shift.location,
          });
          continue;
        }

        const updatedEvent = input.dryRun
          ? ({ ...existing, id: existing.id } as GoogleEvent)
          : await updateGoogleEvent({
              accessToken: tokenState.accessToken,
              calendarId: input.calendarId,
              eventId: existing.id,
              shift,
            });

        summary.updated += 1;
        changes.push({
          type: "update",
          reason: "Shift changed in DB",
          syncShiftKey,
          date: shift.date,
          start: shift.starts_at,
          end: shift.ends_at,
          title: buildSummaryFromShift(shift),
          location: shift.location,
        });

        await upsertRecord({
          userId: input.userId,
          calendarId: input.calendarId,
          shift,
          syncShiftKey,
          event: updatedEvent,
          dryRun: input.dryRun,
        });
      } catch (error) {
        summary.failed += 1;
        errors.push({
          shiftId: shift.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const syncedShifts = [...effectiveShiftMap.values()].map((shift) => ({
    id: shift.id,
    shiftUid: shift.shift_uid,
    googleEventId: shift.google_event_id,
  }));

  return {
    summary,
    changes,
    syncedShifts,
    errors,
  };
}

async function connectCalendar(req: Request, body: SyncRequest): Promise<Response> {
  if (!body.code || !body.redirectUri) {
    return json(400, { error: "Missing code or redirectUri for connect action." });
  }

  const userId = await resolveUserId(req, body.userId);
  const exchange = await exchangeCodeForToken({
    code: body.code,
    redirectUri: body.redirectUri,
  });

  const me = await googleFetch<{ email?: string }>({
    accessToken: exchange.accessToken,
    endpoint: "/users/me/settings/timezone",
  }).catch(() => ({ email: undefined }));

  const connection = await upsertConnection({
    userId,
    googleEmail: (me as { email?: string }).email ?? null,
    defaultCalendarId: body.defaultCalendarId ?? "primary",
    accessToken: exchange.accessToken,
    refreshToken: exchange.refreshToken,
    tokenExpiresAt: exchange.expiresAt,
    syncEnabled: true,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncedAt: null,
  });

  return json(200, safeConnectionStatus(connection));
}

async function statusCalendar(req: Request, body: SyncRequest): Promise<Response> {
  const userId = await resolveUserId(req, body.userId);
  const connection = await getConnection(userId);
  return json(200, safeConnectionStatus(connection));
}

async function updateConnection(req: Request, body: SyncRequest): Promise<Response> {
  const userId = await resolveUserId(req, body.userId);
  const existing = await getConnection(userId);
  if (!existing) {
    return json(404, { error: "Connection not found." });
  }

  const updated = await upsertConnection({
    userId,
    googleEmail: existing.google_email,
    defaultCalendarId:
      body.defaultCalendarId !== undefined
        ? body.defaultCalendarId
        : existing.default_calendar_id,
    accessToken: existing.access_token,
    refreshToken: existing.refresh_token,
    tokenExpiresAt: existing.token_expires_at,
    syncEnabled:
      body.syncEnabled !== undefined ? Boolean(body.syncEnabled) : existing.sync_enabled,
    lastSyncStatus: existing.last_sync_status,
    lastSyncError: existing.last_sync_error,
    lastSyncedAt: existing.last_synced_at,
  });

  return json(200, safeConnectionStatus(updated));
}

async function disconnectCalendar(req: Request, body: SyncRequest): Promise<Response> {
  const userId = await resolveUserId(req, body.userId);
  const existing = await getConnection(userId);
  if (!existing) {
    return json(200, { ok: true });
  }

  await upsertConnection({
    userId,
    googleEmail: existing.google_email,
    defaultCalendarId: existing.default_calendar_id,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    syncEnabled: false,
    lastSyncStatus: "disconnected",
    lastSyncError: null,
    lastSyncedAt: existing.last_synced_at,
  });

  return json(200, { ok: true });
}

async function runCalendarAction(
  req: Request,
  body: SyncRequest,
  mode: "preview" | "apply" | "pull" | "trigger",
): Promise<Response> {
  const userId = await resolveUserId(req, body.userId);
  const connection = await getConnection(userId);
  if (!connection) {
    return json(400, { error: "No Google connection stored for this user." });
  }

  const calendarId = body.calendarId || connection.default_calendar_id || "primary";
  const range = body.dateRange || defaultRange();

  console.info("[CalendarSync][Backend] action requested", {
    action: mode,
    user_id: userId,
    calendar_id: calendarId,
    range,
  });

  const dryRun = mode === "preview";
  const pullOnly = mode === "pull";

  try {
    const result = await runSyncForUser({
      userId,
      calendarId,
      dateRange: range,
      dryRun,
      pullOnly,
    });

    const nowIso = new Date().toISOString();
    await upsertConnection({
      userId,
      googleEmail: connection.google_email,
      defaultCalendarId: connection.default_calendar_id,
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      tokenExpiresAt: connection.token_expires_at,
      syncEnabled: connection.sync_enabled,
      lastSyncedAt: nowIso,
      lastSyncStatus: "ok",
      lastSyncError: null,
    });

    return json(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await upsertConnection({
      userId,
      googleEmail: connection.google_email,
      defaultCalendarId: connection.default_calendar_id,
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      tokenExpiresAt: connection.token_expires_at,
      syncEnabled: connection.sync_enabled,
      lastSyncedAt: new Date().toISOString(),
      lastSyncStatus: "failed",
      lastSyncError: message,
    });

    return json(500, { error: message });
  }
}

async function scheduledPoll(): Promise<Response> {
  const range = defaultRange();
  const { data, error } = await supabase
    .from("external_calendar_connections")
    .select("*")
    .eq("provider", "google")
    .eq("sync_enabled", true);

  if (error) {
    return json(500, { error: error.message });
  }

  const rows = (data as ConnectionRow[] | null) ?? [];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const calendarId = row.default_calendar_id || "primary";
    try {
      await runSyncForUser({
        userId: row.user_id,
        calendarId,
        dateRange: range,
        dryRun: false,
        pullOnly: false,
      });

      await upsertConnection({
        userId: row.user_id,
        googleEmail: row.google_email,
        defaultCalendarId: row.default_calendar_id,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        tokenExpiresAt: row.token_expires_at,
        syncEnabled: row.sync_enabled,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "ok",
        lastSyncError: null,
      });

      processed += 1;
    } catch (error) {
      failed += 1;
      await upsertConnection({
        userId: row.user_id,
        googleEmail: row.google_email,
        defaultCalendarId: row.default_calendar_id,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        tokenExpiresAt: row.token_expires_at,
        syncEnabled: row.sync_enabled,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "failed",
        lastSyncError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json(200, {
    processed,
    failed,
    range,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = (await req.json()) as SyncRequest;

    switch (body.action) {
      case "connect":
        return await connectCalendar(req, body);
      case "status":
        return await statusCalendar(req, body);
      case "update_connection":
        return await updateConnection(req, body);
      case "disconnect":
        return await disconnectCalendar(req, body);
      case "preview":
        return await runCalendarAction(req, body, "preview");
      case "apply":
        return await runCalendarAction(req, body, "apply");
      case "trigger":
        return await runCalendarAction(req, body, "trigger");
      case "pull":
        return await runCalendarAction(req, body, "pull");
      case "scheduled_poll":
        if (!SCHEDULER_SECRET) {
          return json(500, {
            error: "Missing CALENDAR_SYNC_SCHEDULER_SECRET configuration.",
          });
        }

        if ((req.headers.get("x-scheduler-secret") || "") !== SCHEDULER_SECRET) {
          return json(401, { error: "Invalid scheduler secret." });
        }
        return await scheduledPoll();
      default:
        return json(400, { error: "Unknown calendar sync action." });
    }
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
