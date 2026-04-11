/**
 * src/services/backend/supabase-provider.ts
 *
 * BackendServices implementation backed by Supabase.
 * All raw Supabase queries live here; no imports of supabase-client
 * should be needed in UI components once this provider is wired.
 */

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";
import type {
  BackendServices,
  AuthService,
  UserService,
  ShiftService,
  UploadService,
  SwapService,
  LeaveService,
  CalendarSyncService,
  NotificationService,
} from "./types";
import type {
  AuthSession,
  UserProfile,
  Shift,
  SwapAvailability,
  SwapRequest,
  SwapRequestStatus,
  LeaveRequest,
  LeaveRequestStatus,
  ScheduleUpload,
  ScheduleAccessRequest,
} from "@/types/domain";
import { toUserProfile } from "@/shared/mappers/user.mapper";
import { toShift } from "@/shared/mappers/shift.mapper";
import {
  toSwapAvailability,
  toSwapRequest,
} from "@/shared/mappers/swap.mapper";
import { toLeaveRequest } from "@/shared/mappers/leave.mapper";
import {
  toScheduleUpload,
  toScheduleAccessRequest,
} from "@/shared/mappers/upload.mapper";
import { CalendarSyncService as Phase3CalendarSync } from "@/features/calendar/services/calendarSyncService";
import type { CalendarSyncRecordRepository } from "@/features/calendar/types";
import type { ShiftData } from "@/types/shift";

// Helper: throw on Supabase error
function assertNoError<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

function getHomeRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}home`;
}

function isUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// ── Calendar sync helpers ──────────────────────────────────────────────────

/** Returns true when the error is a "table not found" signal from PostgREST. */
function isMissingCalendarSyncRecordsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  const message = (maybe.message ?? "").toLowerCase();
  return (
    maybe.code === "PGRST205" ||
    maybe.code === "42P01" ||
    message.includes('relation "calendar_sync_records" does not exist') ||
    (message.includes("calendar_sync_records") &&
      message.includes("does not exist"))
  );
}

function emitCalendarSyncCompatibilityMode(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("calendar-sync-compat-mode", {
      detail: { enabled },
    }),
  );
}

// localStorage-backed fallback repository (used when Supabase is unavailable).
const LOCAL_SYNC_MAP_PREFIX = "calendar_sync_map";

interface LocalSyncEntry {
  externalEventId: string;
  shiftFingerprint: string;
  syncedStart: string;
  syncedEnd: string;
  syncedTitle: string;
  syncedDescription: string | null;
  syncedLocation: string | null;
  syncStatus: "ok" | "failed";
}

function loadLocalMap(
  userId: string,
  calendarId: string,
): Record<string, LocalSyncEntry> {
  try {
    const raw = localStorage.getItem(
      `${LOCAL_SYNC_MAP_PREFIX}:${userId}:${calendarId}`,
    );
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalMap(
  userId: string,
  calendarId: string,
  map: Record<string, LocalSyncEntry>,
): void {
  localStorage.setItem(
    `${LOCAL_SYNC_MAP_PREFIX}:${userId}:${calendarId}`,
    JSON.stringify(map),
  );
}

function makeLocalCalendarRepository(
  userId: string,
  calendarId: string,
): CalendarSyncRecordRepository {
  return {
    async getRecordsForRange({ range }) {
      const map = loadLocalMap(userId, calendarId);
      return Object.entries(map)
        .filter(
          ([, entry]) =>
            entry.syncedStart.slice(0, 10) >= range.start &&
            entry.syncedStart.slice(0, 10) <= range.end,
        )
        .map(([syncShiftKey, entry]) => ({
          id: syncShiftKey,
          userId,
          provider: "google" as const,
          calendarId,
          shiftId: null,
          syncShiftKey,
          externalEventId: entry.externalEventId,
          shiftFingerprint: entry.shiftFingerprint,
          syncedStart: entry.syncedStart,
          syncedEnd: entry.syncedEnd,
          syncedTitle: entry.syncedTitle,
          syncedDescription: entry.syncedDescription,
          syncedLocation: entry.syncedLocation,
          lastSyncedAt: new Date().toISOString(),
          syncStatus: entry.syncStatus,
          lastError: null,
        }));
    },
    async upsertRecord(input) {
      const map = loadLocalMap(input.userId, input.calendarId);
      map[input.syncShiftKey] = {
        externalEventId: input.externalEventId,
        shiftFingerprint: input.shiftFingerprint,
        syncedStart: input.syncedStart,
        syncedEnd: input.syncedEnd,
        syncedTitle: input.syncedTitle,
        syncedDescription: input.syncedDescription,
        syncedLocation: input.syncedLocation,
        syncStatus: input.syncStatus,
      };
      saveLocalMap(input.userId, input.calendarId, map);
    },
    async deleteRecord(recordId) {
      // For localStorage the record ID is the syncShiftKey.
      const map = loadLocalMap(userId, calendarId);
      delete map[recordId];
      saveLocalMap(userId, calendarId, map);
    },
    async markFailed(recordId) {
      const map = loadLocalMap(userId, calendarId);
      if (map[recordId]) {
        map[recordId].syncStatus = "failed";
        saveLocalMap(userId, calendarId, map);
      }
    },
  };
}

async function persistShiftGoogleEventIds(input: {
  userId: string;
  shifts: ShiftData[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const updates = input.shifts
    .filter((shift) => Boolean(shift.shiftUid) && Boolean(shift.googleEventId))
    .map((shift) => ({
      shift_uid: shift.shiftUid as string,
      google_event_id: shift.googleEventId as string,
    }));

  for (const row of updates) {
    const { error } = await supabase
      .from("shifts")
      .update({ google_event_id: row.google_event_id })
      .eq("user_id", input.userId)
      .eq("shift_uid", row.shift_uid)
      .neq("status", "deleted");

    if (error) {
      console.warn(
        "[CalendarSync][RunSync] failed to persist google_event_id",
        {
          user_id: input.userId,
          shift_uid: row.shift_uid,
          message: error.message,
        },
      );
    }
  }
}

// Supabase-backed calendar sync repository.
const supabaseCalendarRecords: CalendarSyncRecordRepository = {
  async getRecordsForRange({ userId, provider, calendarId, range }) {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("calendar_sync_records")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("calendar_id", calendarId)
      .gte("synced_start", range.start)
      .lte("synced_start", `${range.end}T23:59:59Z`);

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      provider: row.provider as "google",
      calendarId: row.calendar_id as string,
      shiftId: (row.shift_id as string | null) ?? null,
      syncShiftKey: row.sync_shift_key as string,
      externalEventId: row.external_event_id as string,
      shiftFingerprint: row.shift_fingerprint as string,
      syncedStart: row.synced_start as string,
      syncedEnd: row.synced_end as string,
      syncedTitle: row.synced_title as string,
      syncedDescription: (row.synced_description as string | null) ?? null,
      syncedLocation: (row.synced_location as string | null) ?? null,
      lastSyncedAt: row.last_synced_at as string,
      syncStatus: row.sync_status as "ok" | "failed",
      lastError: (row.last_error as string | null) ?? null,
    }));
  },

  async upsertRecord(input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const safeShiftId = isUuid(input.shiftId) ? input.shiftId : null;
    const payload = {
      user_id: input.userId,
      provider: input.provider,
      calendar_id: input.calendarId,
      shift_id: safeShiftId,
      sync_shift_key: input.syncShiftKey,
      external_event_id: input.externalEventId,
      shift_fingerprint: input.shiftFingerprint,
      synced_start: input.syncedStart,
      synced_end: input.syncedEnd,
      synced_title: input.syncedTitle,
      synced_description: input.syncedDescription ?? null,
      synced_location: input.syncedLocation ?? null,
      sync_status: input.syncStatus,
      last_error: input.lastError ?? null,
      last_synced_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("calendar_sync_records")
      .upsert(payload, {
        onConflict: "user_id,provider,calendar_id,sync_shift_key",
      });

    if (!error) {
      return;
    }

    const code = (error as { code?: string }).code;
    const message = (
      (error as { message?: string }).message ?? ""
    ).toLowerCase();
    const details = (
      (error as { details?: string }).details ?? ""
    ).toLowerCase();
    const hint = ((error as { hint?: string }).hint ?? "").toLowerCase();

    const isUniqueViolation =
      code === "23505" ||
      message.includes("duplicate key value violates unique constraint") ||
      details.includes("duplicate key value violates unique constraint") ||
      hint.includes("duplicate key value violates unique constraint");

    const isExternalEventUniqueConflict =
      isUniqueViolation &&
      (message.includes("calendar_sync_records_unique_external_event") ||
        details.includes("calendar_sync_records_unique_external_event") ||
        message.includes("external_event_id") ||
        details.includes("external_event_id"));

    const isSyncShiftKeyUniqueConflict =
      isUniqueViolation &&
      (message.includes("calendar_sync_records_unique_shift_key") ||
        details.includes("calendar_sync_records_unique_shift_key") ||
        message.includes("sync_shift_key") ||
        details.includes("sync_shift_key"));

    const isInvalidUuidShiftId =
      code === "22P02" &&
      message.includes("invalid input syntax for type uuid");

    if (isInvalidUuidShiftId) {
      const { error: retryError } = await supabase
        .from("calendar_sync_records")
        .upsert(
          {
            ...payload,
            shift_id: null,
          },
          { onConflict: "user_id,provider,calendar_id,sync_shift_key" },
        );

      if (!retryError) {
        return;
      }

      throw retryError;
    }

    if (isSyncShiftKeyUniqueConflict && !isExternalEventUniqueConflict) {
      // Existing row already keyed by sync_shift_key: refresh it in place.
      const { error: updateByKeyError } = await supabase
        .from("calendar_sync_records")
        .update(payload)
        .eq("user_id", input.userId)
        .eq("provider", input.provider)
        .eq("calendar_id", input.calendarId)
        .eq("sync_shift_key", input.syncShiftKey);

      if (!updateByKeyError) {
        return;
      }

      throw updateByKeyError;
    }

    if (!isExternalEventUniqueConflict) {
      throw error;
    }

    // Re-key existing tracked row when sync key changes but event id stays the same.
    const { error: updateError } = await supabase
      .from("calendar_sync_records")
      .update(payload)
      .eq("user_id", input.userId)
      .eq("provider", input.provider)
      .eq("calendar_id", input.calendarId)
      .eq("external_event_id", input.externalEventId);

    if (!updateError) {
      return;
    }

    const updateMsg = (
      (updateError as { message?: string }).message ?? ""
    ).toLowerCase();
    const updateDetails = (
      (updateError as { details?: string }).details ?? ""
    ).toLowerCase();
    const updateIsShiftKeyConflict =
      updateMsg.includes("calendar_sync_records_unique_shift_key") ||
      updateDetails.includes("calendar_sync_records_unique_shift_key") ||
      updateMsg.includes("sync_shift_key") ||
      updateDetails.includes("sync_shift_key");

    if (!updateIsShiftKeyConflict) {
      throw updateError;
    }

    // If the new sync key is already occupied by another stale row, delete that row and retry re-key.
    const { error: cleanupError } = await supabase
      .from("calendar_sync_records")
      .delete()
      .eq("user_id", input.userId)
      .eq("provider", input.provider)
      .eq("calendar_id", input.calendarId)
      .eq("sync_shift_key", input.syncShiftKey)
      .neq("external_event_id", input.externalEventId);

    if (cleanupError) {
      throw cleanupError;
    }

    const { error: retryUpdateError } = await supabase
      .from("calendar_sync_records")
      .update(payload)
      .eq("user_id", input.userId)
      .eq("provider", input.provider)
      .eq("calendar_id", input.calendarId)
      .eq("external_event_id", input.externalEventId);

    if (retryUpdateError) {
      throw retryUpdateError;
    }
  },

  async deleteRecord(recordId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { error } = await supabase
      .from("calendar_sync_records")
      .delete()
      .eq("id", recordId);

    if (error) throw error;
  },

  async markFailed(recordId, message) {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase
      .from("calendar_sync_records")
      .update({
        sync_status: "failed",
        last_error: message,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", recordId);
  },
};

// ── AuthService ────────────────────────────────────────────────────────────

const supabaseAuth: AuthService = {
  async getSession(): Promise<AuthSession | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;
    return {
      userId: data.session.user.id,
      email: data.session.user.email ?? "",
      providerToken: data.session.provider_token ?? null,
    };
  },

  async signInWithGoogle(): Promise<string> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        skipBrowserRedirect: true,
        redirectTo: getHomeRedirectUrl(),
        queryParams: { access_type: "offline", prompt: "consent" },
        scopes: "openid email profile https://www.googleapis.com/auth/calendar",
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth redirect URL returned");
    return data.url;
  },

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthChange(callback: (session: AuthSession | null) => void): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!session?.user) {
          callback(null);
          return;
        }
        callback({
          userId: session.user.id,
          email: session.user.email ?? "",
          providerToken: session.provider_token ?? null,
        });
      },
    );
    return () => subscription.unsubscribe();
  },
};

// ── UserService ────────────────────────────────────────────────────────────

const supabaseUsers: UserService = {
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return toUserProfile(data);
  },

  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, "fullName" | "email" | "employeeCode">>,
  ): Promise<UserProfile> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("users")
      .update({
        ...(updates.fullName !== undefined && {
          full_name: updates.fullName,
        }),
        ...(updates.employeeCode !== undefined && {
          employee_code: updates.employeeCode,
        }),
        ...(updates.email !== undefined && { email: updates.email }),
      })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return toUserProfile(data);
  },
};

// ── ShiftService ───────────────────────────────────────────────────────────

const supabaseShifts: ShiftService = {
  async getShiftsForUser(userId: string): Promise<Shift[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toShift);
  },

  async getShiftById(id: string): Promise<Shift | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return toShift(data);
  },

  async createShift(
    shift: Omit<Shift, "id" | "createdAt" | "updatedAt">,
  ): Promise<Shift> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("shifts")
      .insert({
        user_id: shift.userId,
        date: shift.date,
        starts_at: shift.startsAt,
        ends_at: shift.endsAt,
        role: shift.role,
        location: shift.location,
        google_event_id: shift.googleEventId,
        source_upload_id: shift.sourceUploadId,
      })
      .select()
      .single();
    return toShift(assertNoError({ data, error }));
  },

  async updateShift(
    id: string,
    updates: Partial<Omit<Shift, "id" | "userId" | "createdAt" | "updatedAt">>,
  ): Promise<Shift> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("shifts")
      .update({
        ...(updates.date !== undefined && { date: updates.date }),
        ...(updates.startsAt !== undefined && {
          starts_at: updates.startsAt,
        }),
        ...(updates.endsAt !== undefined && { ends_at: updates.endsAt }),
        ...(updates.role !== undefined && { role: updates.role }),
        ...(updates.location !== undefined && {
          location: updates.location,
        }),
        ...(updates.googleEventId !== undefined && {
          google_event_id: updates.googleEventId,
        }),
      })
      .eq("id", id)
      .select()
      .single();
    return toShift(assertNoError({ data, error }));
  },

  async deleteShift(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) throw error;
  },

  async updateGoogleEventId(
    shiftId: string,
    googleEventId: string,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { error } = await supabase
      .from("shifts")
      .update({ google_event_id: googleEventId })
      .eq("id", shiftId);
    if (error) throw error;
  },
};

// ── UploadService ──────────────────────────────────────────────────────────

const supabaseUploads: UploadService = {
  async createUpload(
    data: Omit<ScheduleUpload, "id" | "uploadedAt">,
  ): Promise<ScheduleUpload> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data: row, error } = await supabase
      .from("schedule_uploads")
      .insert({
        uploader_user_id: data.uploaderUserId,
        file_hash: data.fileHash,
        consent_to_share: data.consentToShare,
        metadata: data.metadata,
      })
      .select()
      .single();
    return toScheduleUpload(assertNoError({ data: row, error }));
  },

  async getUploadById(id: string): Promise<ScheduleUpload | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("schedule_uploads")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return toScheduleUpload(data);
  },

  async getUploadsByUser(userId: string): Promise<ScheduleUpload[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("schedule_uploads")
      .select("*")
      .eq("uploader_user_id", userId)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toScheduleUpload);
  },

  async getAccessRequestsForUpload(
    uploadId: string,
  ): Promise<ScheduleAccessRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("schedule_access_requests")
      .select("*")
      .eq("schedule_upload_id", uploadId);
    if (error) throw error;
    return (data ?? []).map(toScheduleAccessRequest);
  },

  async createAccessRequest(
    data: Omit<ScheduleAccessRequest, "id" | "createdAt" | "updatedAt">,
  ): Promise<ScheduleAccessRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data: row, error } = await supabase
      .from("schedule_access_requests")
      .insert({
        requester_user_id: data.requesterUserId,
        schedule_upload_id: data.scheduleUploadId,
        consent_given: data.consentGiven,
        status: data.status,
        reviewed_at: data.reviewedAt,
        reviewed_by_user_id: data.reviewedByUserId,
      })
      .select()
      .single();
    return toScheduleAccessRequest(assertNoError({ data: row, error }));
  },

  async updateAccessRequest(
    id: string,
    updates: Partial<
      Pick<
        ScheduleAccessRequest,
        "consentGiven" | "status" | "reviewedAt" | "reviewedByUserId"
      >
    >,
  ): Promise<ScheduleAccessRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("schedule_access_requests")
      .update({
        ...(updates.consentGiven !== undefined && {
          consent_given: updates.consentGiven,
        }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.reviewedAt !== undefined && {
          reviewed_at: updates.reviewedAt,
        }),
        ...(updates.reviewedByUserId !== undefined && {
          reviewed_by_user_id: updates.reviewedByUserId,
        }),
      })
      .eq("id", id)
      .select()
      .single();
    return toScheduleAccessRequest(assertNoError({ data, error }));
  },
};

// ── SwapService ────────────────────────────────────────────────────────────

const supabaseSwaps: SwapService = {
  async openAvailability(
    shiftId: string,
    userId: string,
  ): Promise<SwapAvailability> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("swap_availability")
      .insert({
        shift_id: shiftId,
        opened_by_user_id: userId,
        is_open: true,
      })
      .select()
      .single();
    return toSwapAvailability(assertNoError({ data, error }));
  },

  async closeAvailability(shiftId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { error } = await supabase
      .from("swap_availability")
      .update({ is_open: false, closed_at: new Date().toISOString() })
      .eq("shift_id", shiftId);
    if (error) throw error;
  },

  async getOpenAvailabilities(): Promise<
    Array<{ shift: Shift; availability: SwapAvailability }>
  > {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("swap_availability")
      .select("*, shifts(*)")
      .eq("is_open", true);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      availability: toSwapAvailability(row),
      shift: toShift(row.shifts as Parameters<typeof toShift>[0]),
    }));
  },

  async createSwapRequest(input: {
    requesterUserId: string;
    requesterShiftId: string;
    targetUserId: string;
    targetShiftId?: string;
    message?: string;
  }): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("swap_requests")
      .insert({
        requester_user_id: input.requesterUserId,
        requester_shift_id: input.requesterShiftId,
        target_user_id: input.targetUserId,
        target_shift_id: input.targetShiftId ?? null,
        message: input.message ?? null,
        status: "pending",
      })
      .select()
      .single();
    return toSwapRequest(assertNoError({ data, error }));
  },

  async getSwapRequestsForUser(userId: string): Promise<SwapRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("swap_requests")
      .select("*")
      .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSwapRequest);
  },

  async updateSwapStatus(
    id: string,
    status: SwapRequestStatus,
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("swap_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    return toSwapRequest(assertNoError({ data, error }));
  },
};

// ── LeaveService ───────────────────────────────────────────────────────────

const supabaseLeave: LeaveService = {
  async createLeaveRequest(
    input: Omit<LeaveRequest, "id" | "status" | "createdAt" | "updatedAt">,
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .insert({
        user_id: input.userId,
        start_date: input.startDate,
        end_date: input.endDate,
        type: input.type,
        notes: input.notes,
        status: "pending",
      })
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async getLeaveRequestsForUser(userId: string): Promise<LeaveRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toLeaveRequest);
  },

  async updateLeaveStatus(
    id: string,
    status: LeaveRequestStatus,
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },
};

// ── CalendarSyncService ────────────────────────────────────────────────────

const supabaseCalendar: CalendarSyncService = {
  async syncShifts(
    shifts: Shift[],
    accessToken: string,
    calendarId: string,
  ): Promise<{ created: number; updated: number; deleted: number }> {
    // Legacy path kept for backward compatibility. Prefer runSync for new callers.
    const { GoogleCalendarService } = await import("@/lib/google-calendar");
    const service = new GoogleCalendarService(accessToken);
    let created = 0;
    let updated = 0;
    const deleted = 0;

    for (const shift of shifts) {
      const shiftData = {
        id: shift.id,
        week: 0,
        date: new Date(shift.date),
        startTime: shift.startsAt,
        endTime: shift.endsAt,
        shiftType: "other" as const,
        status: "active" as const,
        googleEventId: shift.googleEventId ?? undefined,
      };

      if (!shift.googleEventId) {
        await service.createEvent(calendarId, shiftData);
        created++;
      } else {
        await service.updateEvent(calendarId, shift.googleEventId, shiftData);
        updated++;
      }
    }

    return { created, updated, deleted };
  },

  async runSync(shifts, options) {
    const supabase = getSupabaseClient();

    if (supabase) {
      const { data: dbShifts, error: dbShiftError } = await supabase
        .from("shifts")
        .select("shift_uid, google_event_id, date, starts_at, ends_at")
        .eq("user_id", options.userId)
        .order("date", { ascending: true });

      if (!dbShiftError) {
        console.info("[CalendarSync][RunSync][DBState]", {
          user_id: options.userId,
          rows: (dbShifts ?? []).map((row) => ({
            shift_uid: row.shift_uid,
            google_event_id: row.google_event_id,
            date: row.date,
            start_time: row.starts_at,
            end_time: row.ends_at,
          })),
        });
      }
    }

    let result: Awaited<
      ReturnType<InstanceType<typeof Phase3CalendarSync>["apply"]>
    >;

    if (!supabase) {
      emitCalendarSyncCompatibilityMode(true);
      // No Supabase: use localStorage directly.
      const repo = makeLocalCalendarRepository(
        options.userId,
        options.calendarId,
      );
      const service = new Phase3CalendarSync(repo);
      result = await service.apply({
        shifts,
        accessToken: options.accessToken,
        options: {
          userId: options.userId,
          provider: "google",
          calendarId: options.calendarId,
          dateRange: options.dateRange,
          fullResync: options.fullResync,
          removeStaleEvents: options.removeStaleEvents ?? true,
        },
      });
    } else {
      try {
        const service = new Phase3CalendarSync(supabaseCalendarRecords);
        result = await service.apply({
          shifts,
          accessToken: options.accessToken,
          options: {
            userId: options.userId,
            provider: "google",
            calendarId: options.calendarId,
            dateRange: options.dateRange,
            fullResync: options.fullResync,
            removeStaleEvents: options.removeStaleEvents ?? true,
          },
        });
        emitCalendarSyncCompatibilityMode(false);
      } catch (err) {
        if (isMissingCalendarSyncRecordsTable(err)) {
          emitCalendarSyncCompatibilityMode(true);
          // Supabase table not yet migrated — fall back to localStorage.
          const repo = makeLocalCalendarRepository(
            options.userId,
            options.calendarId,
          );
          const service = new Phase3CalendarSync(repo);
          result = await service.apply({
            shifts,
            accessToken: options.accessToken,
            options: {
              userId: options.userId,
              provider: "google",
              calendarId: options.calendarId,
              dateRange: options.dateRange,
              fullResync: options.fullResync,
              removeStaleEvents: options.removeStaleEvents ?? true,
            },
          });
        } else {
          throw err;
        }
      }
    }

    if (supabase) {
      await persistShiftGoogleEventIds({
        userId: options.userId,
        shifts: result.syncedShifts,
      });
    }

    return {
      summary: result.summary,
      changes: result.changes,
      syncedShifts: result.syncedShifts,
      errors: result.errors.map((e) => ({
        shiftId: e.shiftId,
        message: e.message,
      })),
    };
  },

  async previewSync(shifts, options) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      emitCalendarSyncCompatibilityMode(true);
      const repo = makeLocalCalendarRepository(
        options.userId,
        options.calendarId,
      );
      const service = new Phase3CalendarSync(repo);
      const preview = await service.preview({
        shifts,
        accessToken: options.accessToken,
        options: {
          userId: options.userId,
          provider: "google",
          calendarId: options.calendarId,
          dateRange: options.dateRange,
          fullResync: options.fullResync,
          removeStaleEvents: options.removeStaleEvents ?? true,
        },
      });
      return {
        summary: preview.summary,
        changes: preview.changes,
      };
    }

    try {
      const service = new Phase3CalendarSync(supabaseCalendarRecords);
      const preview = await service.preview({
        shifts,
        accessToken: options.accessToken,
        options: {
          userId: options.userId,
          provider: "google",
          calendarId: options.calendarId,
          dateRange: options.dateRange,
          fullResync: options.fullResync,
          removeStaleEvents: options.removeStaleEvents ?? true,
        },
      });
      emitCalendarSyncCompatibilityMode(false);
      return {
        summary: preview.summary,
        changes: preview.changes,
      };
    } catch (err) {
      if (!isMissingCalendarSyncRecordsTable(err)) {
        throw err;
      }

      emitCalendarSyncCompatibilityMode(true);
      const repo = makeLocalCalendarRepository(
        options.userId,
        options.calendarId,
      );
      const service = new Phase3CalendarSync(repo);
      const preview = await service.preview({
        shifts,
        accessToken: options.accessToken,
        options: {
          userId: options.userId,
          provider: "google",
          calendarId: options.calendarId,
          dateRange: options.dateRange,
          fullResync: options.fullResync,
          removeStaleEvents: options.removeStaleEvents ?? true,
        },
      });
      return {
        summary: preview.summary,
        changes: preview.changes,
      };
    }
  },
};

// ── NotificationService ────────────────────────────────────────────────────

const supabaseNotifications: NotificationService = {
  async notifyHR(_subject: string, _body: string): Promise<void> {
    // Stub: will be wired to Supabase Edge Function or email trigger in Phase 7.
    console.info("[NotificationService] notifyHR called (stub)");
  },
};

// ── Export full provider ───────────────────────────────────────────────────

export class SupabaseProvider implements BackendServices {
  auth = supabaseAuth;
  users = supabaseUsers;
  shifts = supabaseShifts;
  uploads = supabaseUploads;
  swaps = supabaseSwaps;
  leave = supabaseLeave;
  calendar = supabaseCalendar;
  notifications = supabaseNotifications;
}
