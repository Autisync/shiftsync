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
  LeaveNotificationPayload,
  EmailPreviewPayload,
  ReminderService,
  WorkflowService,
  WorkflowActionValidationResult,
  FileAttachmentInput,
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
  HRSettings,
  AppNotification,
  LeaveRequestAttachment,
  PaginatedQuery,
  PaginatedResult,
  ReminderJob,
  SyncSession,
  UploadTrustAssessment,
  WorkflowActionToken,
} from "@/types/domain";
import { toUserProfile } from "@/shared/mappers/user.mapper";
import { toShift } from "@/shared/mappers/shift.mapper";
import {
  toSwapAvailability,
  toSwapRequest,
} from "@/shared/mappers/swap.mapper";
import { toHRSettings } from "@/shared/mappers/hr-settings.mapper";
import { assertSwapStatusTransition } from "@/features/swaps/services/swap-workflow";
import { toLeaveRequest } from "@/shared/mappers/leave.mapper";
import {
  toScheduleUpload,
  toScheduleAccessRequest,
} from "@/shared/mappers/upload.mapper";
import { GoogleCalendarService } from "@/lib/google-calendar";
import { CalendarSyncService as Phase3CalendarSync } from "@/features/calendar/services/calendarSyncService";
import type { CalendarSyncRecordRepository } from "@/features/calendar/types";
import type { ShiftData } from "@/types/shift";
import { getDebugErrorMessage, getErrorMessage } from "@/lib/getErrorMessage";

// Helper: throw on Supabase error
function assertNoError<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw new Error(getErrorMessage(result.error));
  }
  if (result.data === null) throw new Error("No data returned");
  return result.data;
}

function normalizeQuery(query: PaginatedQuery): {
  page: number;
  pageSize: number;
} {
  const page = Number.isFinite(query.page)
    ? Math.max(1, Math.floor(query.page))
    : 1;
  const pageSize = Number.isFinite(query.pageSize)
    ? Math.min(100, Math.max(1, Math.floor(query.pageSize)))
    : 10;
  return { page, pageSize };
}

function toPaginatedResult<T>(input: {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(input.total / input.pageSize));
  return {
    items: input.items,
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    totalPages,
    hasNextPage: input.page < totalPages,
    hasPreviousPage: input.page > 1,
  };
}

function getHomeRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}home`;
}

const LEAVE_ATTACHMENTS_BUCKET = "leave-attachments";

function sanitizeStorageFileName(fileName: string): string {
  return (
    fileName
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "attachment"
  );
}

function explainLeaveAttachmentUploadError(error: unknown): string {
  const debug = getDebugErrorMessage(error).toLowerCase();

  if (debug.includes("bucket") && debug.includes("not found")) {
    return "Upload indisponível: o bucket 'leave-attachments' não existe no projeto Supabase.";
  }

  if (debug.includes("row-level security") || debug.includes("permission")) {
    return "Upload bloqueado por permissões. Aplique as policies de storage para o bucket 'leave-attachments'.";
  }

  if (
    debug.includes("maximum allowed size") ||
    debug.includes("file too large") ||
    debug.includes("payload too large")
  ) {
    return "O ficheiro excede o tamanho máximo permitido para anexos (10 MB).";
  }

  return `Falha no upload do anexo: ${getErrorMessage(error)}`;
}

async function uploadLeaveAttachmentFiles(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  leaveRequestId: string,
  attachments: FileAttachmentInput[] | undefined,
): Promise<{
  actorUserId: string;
  attachments: Array<{
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
    storagePath: string;
  }>;
}> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const actorUserId = data.user?.id;
  if (!actorUserId) {
    throw new Error("Sessão inválida para enviar anexos ao RH.");
  }

  const resolvedAttachments: Array<{
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
    storagePath: string;
  }> = [];

  for (const item of attachments ?? []) {
    if (item.storagePath) {
      resolvedAttachments.push({
        fileName: item.fileName,
        fileType: item.fileType ?? null,
        fileSize: item.fileSize ?? null,
        storagePath: item.storagePath,
      });
      continue;
    }

    if (!(item.file instanceof File)) {
      throw new Error(
        `O anexo ${item.fileName} não contém um ficheiro válido.`,
      );
    }

    const storagePath = [
      actorUserId,
      leaveRequestId,
      `${crypto.randomUUID()}-${sanitizeStorageFileName(item.fileName)}`,
    ].join("/");

    const { error: uploadError } = await supabase.storage
      .from(LEAVE_ATTACHMENTS_BUCKET)
      .upload(storagePath, item.file, {
        contentType: item.file.type || item.fileType || undefined,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(explainLeaveAttachmentUploadError(uploadError));
    }

    resolvedAttachments.push({
      fileName: item.fileName,
      fileType: item.fileType ?? item.file.type ?? null,
      fileSize: item.fileSize ?? item.file.size ?? null,
      storagePath,
    });
  }

  return {
    actorUserId,
    attachments: resolvedAttachments,
  };
}

function isUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function createSecureToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  const baseMessage = getErrorMessage(error);
  const response = (error as { context?: unknown } | null)?.context as
    | {
        status?: number;
        statusText?: string;
        text?: () => Promise<string>;
      }
    | undefined;

  if (!response || typeof response.text !== "function") {
    return baseMessage;
  }

  try {
    const rawBody = await response.text();
    if (!rawBody) {
      return baseMessage;
    }

    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }

    const statusPart = Number.isFinite(response.status)
      ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
      : "HTTP error";

    if (parsedBody) {
      const errorText =
        typeof parsedBody.error === "string" ? parsedBody.error : null;
      const detailsText =
        typeof parsedBody.details === "string"
          ? parsedBody.details
          : Array.isArray(parsedBody.details)
            ? parsedBody.details.join(" | ")
            : null;

      const parts = [statusPart, errorText, detailsText].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(": ");
      }
    }

    return `${statusPart}: ${rawBody}`;
  } catch {
    return baseMessage;
  }
}

function extractPostgrestErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return getErrorMessage(error);
  }

  const maybe = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  };

  const parts = [maybe.message, maybe.details, maybe.hint]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" | ");
  }

  if (maybe.code !== undefined && maybe.code !== null) {
    return String(maybe.code);
  }

  return getErrorMessage(error);
}

function mapApplySwapRpcMessage(message: string): string {
  const normalized = message.toLowerCase();

  const formatConflictWindow = (input: string): string | null => {
    const startMatch = input.match(/starts_at=([^,\)]+)/i);
    const endMatch = input.match(/ends_at=([^,\)]+)/i);

    if (!startMatch?.[1] || !endMatch?.[1]) {
      return null;
    }

    const start = new Date(startMatch[1].trim());
    const end = new Date(endMatch[1].trim());

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    const day = start.toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const from = start.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const to = end.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return `${day}, ${from}-${to}`;
  };

  if (normalized.includes("swap request not found")) {
    return "Pedido de troca não encontrado.";
  }

  if (normalized.includes("not authenticated")) {
    return "Sessão expirada. Inicie sessão novamente.";
  }

  if (normalized.includes("not authorized to apply this swap")) {
    return "Não tem permissão para aplicar esta troca.";
  }

  if (normalized.includes("swap must be ready before applying")) {
    return "A troca ainda não está pronta para aplicar.";
  }

  if (normalized.includes("target shift is required to apply swap")) {
    return "Turno de destino em falta para concluir a troca.";
  }

  if (normalized.includes("requester shift not found")) {
    return "Turno do requisitante não encontrado.";
  }

  if (normalized.includes("target shift not found")) {
    return "Turno de destino não encontrado.";
  }

  if (
    normalized.includes(
      "swap cannot be applied: target user already has a shift in requester slot",
    )
  ) {
    const windowText = formatConflictWindow(message);
    return windowText
      ? `Conflito de horários: a outra pessoa já tem um turno nesse período (${windowText}).`
      : "Conflito de horários: a outra pessoa já tem um turno nesse período.";
  }

  if (
    normalized.includes(
      "swap cannot be applied: requester already has a shift in target slot",
    )
  ) {
    const windowText = formatConflictWindow(message);
    return windowText
      ? `Conflito de horários: já tem um turno nesse período (${windowText}).`
      : "Conflito de horários: já tem um turno nesse período.";
  }

  if (
    normalized.includes("swap cannot be applied: shift ownership changed") ||
    normalized.includes("shift ownership changed since approval")
  ) {
    return "Os turnos mudaram desde a aprovação. Atualize os pedidos e tente novamente.";
  }

  return message;
}

async function getEdgeInvokeAuthHeaders(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new Error(
      "Sessão inválida para gerar links do RH. Faça login novamente.",
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function createInAppNotification(input: {
  userId: string;
  type: AppNotification["type"];
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await (supabase as any).from("notifications").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("[notifications] create failed", getDebugErrorMessage(error));
    return;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("in-app-notification-created", {
        detail: { userId: input.userId },
      }),
    );
  }
}

async function sendRequestReminderEmail(input: {
  requestType: "swap_request" | "leave_request";
  requestId: string;
  recipientUserId: string;
  reason:
    | "request_created"
    | "awaiting_peer_decision"
    | "submitted_to_hr"
    | "awaiting_hr_decision"
    | "status_update";
  actorUserId?: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const authHeaders = await getEdgeInvokeAuthHeaders(supabase);
    const { error } = await supabase.functions.invoke(
      "send-request-reminder-email",
      {
        headers: authHeaders,
        body: {
          request_type: input.requestType,
          request_id: input.requestId,
          recipient_user_id: input.recipientUserId,
          reason: input.reason,
          actor_user_id: input.actorUserId ?? null,
        },
      },
    );

    if (error) {
      const message = await extractInvokeErrorMessage(error);
      console.warn(
        "[reminders] send-request-reminder-email failed",
        input,
        message,
      );
    }
  } catch (error) {
    console.warn(
      "[reminders] send-request-reminder-email failed",
      input,
      getDebugErrorMessage(error),
    );
  }
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
    async getRecordsBySyncKeys({ syncShiftKeys }) {
      const keys = new Set(syncShiftKeys);
      const map = loadLocalMap(userId, calendarId);
      return Object.entries(map)
        .filter(([syncShiftKey]) => keys.has(syncShiftKey))
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

export async function persistShiftGoogleEventIds(input: {
  userId: string;
  shifts: ShiftData[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const updates = input.shifts
    .filter((shift) => Boolean(shift.shiftUid))
    .map((shift) => ({
      shift_uid: shift.shiftUid as string,
      google_event_id: shift.googleEventId ?? null,
      date: shift.date.toISOString().slice(0, 10),
      starts_at: (() => {
        const date = new Date(shift.date);
        const [h, m] = shift.startTime.split(":").map(Number);
        date.setHours(h || 0, m || 0, 0, 0);
        return date.toISOString();
      })(),
      ends_at: (() => {
        const date = new Date(shift.date);
        const [h, m] = shift.endTime.split(":").map(Number);
        date.setHours(h || 0, m || 0, 0, 0);
        return date.toISOString();
      })(),
      location: shift.location ?? null,
      status: shift.status === "deleted" ? "deleted" : "active",
    }));

  for (const row of updates) {
    const { error } = await supabase
      .from("shifts")
      .update({
        google_event_id: row.google_event_id,
        date: row.date,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        location: row.location,
        // IMPORTANT: never map Google-derived summary/notes into business
        // fields like `role`. `role` is app/domain-owned and must remain
        // authoritative unless we introduce a dedicated shift title/notes column.
        status: row.status,
      })
      .eq("user_id", input.userId)
      .eq("shift_uid", row.shift_uid)
      .or("status.eq.active,status.eq.deleted");

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

  async getRecordsBySyncKeys({ userId, provider, calendarId, syncShiftKeys }) {
    if (syncShiftKeys.length === 0) {
      return [];
    }

    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("calendar_sync_records")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("calendar_id", calendarId)
      .in("sync_shift_key", syncShiftKeys);

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

    const updatePayload = {
      ...(updates.fullName !== undefined && {
        full_name: updates.fullName,
      }),
      ...(updates.employeeCode !== undefined && {
        employee_code: updates.employeeCode,
      }),
      ...(updates.email !== undefined && { email: updates.email }),
    };

    const { data, error } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", userId)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return toUserProfile(data);
    }

    const fallbackEmployeeCode =
      updates.employeeCode?.trim() || `USER-${userId.slice(0, 8)}`;

    const { data: upsertedData, error: upsertError } = await supabase
      .from("users")
      .upsert(
        {
          id: userId,
          employee_code: fallbackEmployeeCode,
          full_name: updates.fullName ?? null,
          email: updates.email ?? null,
        },
        { onConflict: "id" },
      )
      .select()
      .single();

    if (upsertError) throw upsertError;
    return toUserProfile(upsertedData);
  },

  async getDefaultCalendarPreference(userId: string): Promise<{
    calendarId: string;
    calendarName: string | null;
  } | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("user_calendar_preferences")
      .select("calendar_id, calendar_name")
      .eq("user_id", userId)
      .single();

    if (error?.code === "PGRST116") {
      return null;
    }
    if (error) throw error;
    if (!data) return null;

    return {
      calendarId: data.calendar_id as string,
      calendarName: (data.calendar_name as string | null) ?? null,
    };
  },

  async saveDefaultCalendarPreference(
    userId: string,
    input: { calendarId: string; calendarName?: string | null },
  ): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { error } = await supabase.from("user_calendar_preferences").upsert(
      {
        user_id: userId,
        calendar_id: input.calendarId,
        calendar_name: input.calendarName ?? null,
      },
      { onConflict: "user_id" },
    );

    if (error) throw error;
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
    const upload = toScheduleUpload(assertNoError({ data: row, error }));

    await createInAppNotification({
      userId: data.uploaderUserId,
      type: "upload_processing",
      title: "Upload processado",
      body: "O seu ficheiro de escala foi importado para o estado interno.",
      entityType: "schedule_upload",
      entityId: upload.id,
    });

    return upload;
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

  async getUploadsByUserPaginated(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<ScheduleUpload>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return toPaginatedResult({ items: [], page: 1, pageSize: 5, total: 0 });
    }

    const { page, pageSize } = normalizeQuery(query);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from("schedule_uploads")
      .select("*", { count: "exact" })
      .eq("uploader_user_id", userId)
      .order("uploaded_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return toPaginatedResult({
      items: (data ?? []).map(toScheduleUpload),
      page,
      pageSize,
      total: count ?? 0,
    });
  },

  async getUploadTrustAssessments(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<UploadTrustAssessment>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return toPaginatedResult({ items: [], page: 1, pageSize: 5, total: 0 });
    }

    const { page, pageSize } = normalizeQuery(query);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const db = supabase as unknown as {
      from: (table: string) => {
        select: (
          cols: string,
          opts?: { count?: "exact" | "planned" | "estimated" },
        ) => {
          eq: (
            col: string,
            val: string,
          ) => {
            order: (
              col: string,
              opts: { ascending: boolean },
            ) => {
              range: (
                from: number,
                to: number,
              ) => Promise<{
                data: Array<Record<string, unknown>> | null;
                error: unknown;
                count: number | null;
              }>;
            };
          };
        };
      };
    };

    const result = await db
      .from("upload_trust_assessments")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("assessed_at", { ascending: false })
      .range(from, to);

    if (result.error) {
      throw new Error(getErrorMessage(result.error));
    }

    const items: UploadTrustAssessment[] = (result.data ?? []).map((row) => ({
      id: String(row.id),
      uploadId: String(row.upload_id),
      userId: String(row.user_id),
      normalizedCoverageStart:
        (row.normalized_coverage_start as string | null) ?? null,
      normalizedCoverageEnd:
        (row.normalized_coverage_end as string | null) ?? null,
      duplicateCoverageCount: Number(row.duplicate_coverage_count ?? 0),
      trustScore: Number(row.trust_score ?? 0),
      trustLevel: (row.trust_level as "low" | "medium" | "high") ?? "low",
      trustReason: String(row.trust_reason ?? "Sem avaliação detalhada"),
      conflictsCount: Number(row.conflicts_count ?? 0),
      assessedAt: String(row.assessed_at ?? new Date(0).toISOString()),
    }));

    return toPaginatedResult({
      items,
      page,
      pageSize,
      total: result.count ?? 0,
    });
  },

  async getUploadTrustAssessmentByUpload(
    uploadId: string,
  ): Promise<UploadTrustAssessment | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const db = supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: unknown;
            }>;
          };
        };
      };
    };

    const { data, error } = await db
      .from("upload_trust_assessments")
      .select("*")
      .eq("upload_id", uploadId)
      .maybeSingle();

    if (error) {
      throw new Error(getErrorMessage(error));
    }
    if (!data) return null;

    return {
      id: String(data.id),
      uploadId: String(data.upload_id),
      userId: String(data.user_id),
      normalizedCoverageStart:
        (data.normalized_coverage_start as string | null) ?? null,
      normalizedCoverageEnd:
        (data.normalized_coverage_end as string | null) ?? null,
      duplicateCoverageCount: Number(data.duplicate_coverage_count ?? 0),
      trustScore: Number(data.trust_score ?? 0),
      trustLevel: (data.trust_level as "low" | "medium" | "high") ?? "low",
      trustReason: String(data.trust_reason ?? "Sem avaliação detalhada"),
      conflictsCount: Number(data.conflicts_count ?? 0),
      assessedAt: String(data.assessed_at ?? new Date(0).toISOString()),
    };
  },

  async startUploadSelectionSync(input): Promise<SyncSession> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    if (!input.acknowledgeRisk) {
      throw new Error(
        "Confirme o reconhecimento de risco antes de sincronizar.",
      );
    }

    const acknowledgedAt = input.acknowledgedAt ?? new Date().toISOString();
    const acknowledgedByUserId = input.acknowledgedByUserId ?? input.userId;

    const { data: sessionRow, error: sessionError } = await (supabase as any)
      .from("sync_sessions")
      .insert({
        user_id: input.userId,
        upload_id: input.uploadId,
        source: "schedule_share",
        status: "running",
        summary: {
          calendar_id: input.calendarId,
          acknowledge_risk: input.acknowledgeRisk,
          acknowledged_at: acknowledgedAt,
          acknowledged_by_user_id: acknowledgedByUserId,
        },
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (sessionError) {
      throw new Error(getErrorMessage(sessionError));
    }

    await (supabase as any)
      .from("schedule_uploads")
      .update({
        selected_for_sync_at: acknowledgedAt,
        processing_status: "syncing",
      })
      .eq("id", input.uploadId)
      .eq("uploader_user_id", input.userId);

    const { error: invokeError } = await supabase.functions.invoke(
      "sync-upload-selection",
      {
        body: {
          user_id: input.userId,
          upload_id: input.uploadId,
          calendar_id: input.calendarId,
          access_token: input.accessToken,
          sync_session_id: sessionRow.id,
        },
      },
    );

    if (invokeError) {
      await (supabase as any)
        .from("sync_sessions")
        .update({
          status: "failed",
          error: getErrorMessage(invokeError),
          finished_at: new Date().toISOString(),
        })
        .eq("id", sessionRow.id);

      await createInAppNotification({
        userId: input.userId,
        type: "schedule_share",
        title: "Sincronização da partilha falhou",
        body: "Não foi possível iniciar a sincronização do upload selecionado.",
        entityType: "sync_session",
        entityId: String(sessionRow.id),
      });
      throw new Error(getErrorMessage(invokeError));
    }

    await createInAppNotification({
      userId: input.userId,
      type: "schedule_share",
      title: "Sincronização iniciada",
      body: "A sincronização do upload para o calendário foi iniciada.",
      entityType: "sync_session",
      entityId: String(sessionRow.id),
    });

    return {
      id: String(sessionRow.id),
      userId: String(sessionRow.user_id),
      uploadId: (sessionRow.upload_id as string | null) ?? null,
      source: "schedule_share",
      status: (sessionRow.status as SyncSession["status"]) ?? "running",
      summary: (sessionRow.summary as Record<string, unknown>) ?? {},
      error: (sessionRow.error as string | null) ?? null,
      startedAt: String(sessionRow.started_at),
      finishedAt: (sessionRow.finished_at as string | null) ?? null,
    };
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
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("swap_availability")
      .upsert(
        {
          shift_id: shiftId,
          opened_by_user_id: userId,
          is_open: true,
          opened_at: now,
          closed_at: null,
        },
        { onConflict: "shift_id" },
      )
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
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("swap_requests")
      .insert({
        requester_user_id: input.requesterUserId,
        requester_shift_id: input.requesterShiftId,
        target_user_id: input.targetUserId,
        target_shift_id: input.targetShiftId ?? null,
        message: input.message ?? null,
        status: "pending",
        pending_at: now,
        status_history: [
          {
            status: "pending",
            changed_at: now,
            changed_by_user_id: input.requesterUserId,
          },
        ],
      })
      .select()
      .single();
    const createdRequest = toSwapRequest(assertNoError({ data, error }));

    await Promise.all([
      createInAppNotification({
        userId: input.targetUserId,
        type: "swap_request",
        title: "Novo pedido de troca",
        body: "Recebeste um novo pedido de troca para análise.",
        entityType: "swap_request",
        entityId: createdRequest.id,
      }),
      createInAppNotification({
        userId: input.requesterUserId,
        type: "swap_request",
        title: "Pedido de troca enviado",
        body: "O pedido foi enviado e aguarda resposta do colega.",
        entityType: "swap_request",
        entityId: createdRequest.id,
      }),
      sendRequestReminderEmail({
        requestType: "swap_request",
        requestId: createdRequest.id,
        recipientUserId: input.targetUserId,
        reason: "awaiting_peer_decision",
        actorUserId: input.requesterUserId,
      }),
      sendRequestReminderEmail({
        requestType: "swap_request",
        requestId: createdRequest.id,
        recipientUserId: input.requesterUserId,
        reason: "request_created",
        actorUserId: input.requesterUserId,
      }),
    ]);

    return createdRequest;
  },

  async getSwapRequestById(id: string): Promise<SwapRequest | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toSwapRequest(data) : null;
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

  async getSwapRequestsForUserPaginated(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<SwapRequest>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return toPaginatedResult({ items: [], page: 1, pageSize: 5, total: 0 });
    }

    const { page, pageSize } = normalizeQuery(query);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from("swap_requests")
      .select("*", { count: "exact" })
      .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return toPaginatedResult({
      items: (data ?? []).map(toSwapRequest),
      page,
      pageSize,
      total: count ?? 0,
    });
  },

  async updateSwapStatus(
    id: string,
    status: SwapRequestStatus,
    actorUserId?: string,
    violations?: { code: string; reason: string },
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data: existingData, error: existingError } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", id)
      .single();
    const existing = assertNoError({
      data: existingData,
      error: existingError,
    });

    assertSwapStatusTransition(existing.status, status);

    // Canonical acceptance workflow: accepting a pending request triggers
    // automatic HR email dispatch and status advancement handled by acceptSwapRequest.
    if (status === "accepted" && existing.status === "pending") {
      if (violations) {
        const { data, error } = await supabase
          .from("swap_requests")
          .update({
            rule_violation: violations.code,
            violation_reason: violations.reason,
          })
          .eq("id", id)
          .select()
          .single();
        return toSwapRequest(assertNoError({ data, error }));
      }

      if (!actorUserId) {
        throw new Error("Utilizador responsável pela aceitação não informado.");
      }

      return supabaseSwaps.acceptSwapRequest(id, actorUserId, {
        valid: true,
        violations: [],
      });
    }

    const now = new Date().toISOString();
    const currentHistory = Array.isArray(existing.status_history)
      ? existing.status_history
      : [];

    const patch: {
      status: SwapRequestStatus;
      status_history: unknown[];
      accepted_at?: string | null;
      rejected_at?: string | null;
      submitted_to_hr_at?: string | null;
      approved_at?: string | null;
      rule_violation?: string | null;
      violation_reason?: string | null;
    } = {
      status,
      status_history: [
        ...currentHistory,
        {
          status,
          changed_at: now,
          changed_by_user_id: actorUserId ?? null,
        },
      ],
    };

    if (violations) {
      patch.rule_violation = violations.code;
      patch.violation_reason = violations.reason;
    }

    if (status === "accepted") {
      patch.accepted_at = now;
    }
    if (status === "rejected") {
      patch.rejected_at = now;
    }
    if (status === "submitted_to_hr") {
      patch.submitted_to_hr_at = now;
    }
    if (status === "approved") {
      patch.approved_at = now;
    }

    const { data, error } = await supabase
      .from("swap_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    return toSwapRequest(assertNoError({ data, error }));
  },

  async acceptSwapRequest(
    requestId: string,
    targetUserId: string,
    validationResult: {
      valid: boolean;
      violations: Array<{ code: string; message: string }>;
    },
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const now = new Date().toISOString();
    const actorUserId = isUuid(targetUserId) ? targetUserId : null;

    // If validation failed, create update with violations but don't change status
    if (!validationResult.valid) {
      const violation = validationResult.violations[0];
      const { data, error } = await supabase
        .from("swap_requests")
        .update({
          rule_violation: violation.code,
          violation_reason: violation.message,
        })
        .eq("id", requestId)
        .select()
        .single();
      return toSwapRequest(assertNoError({ data, error }));
    }

    // Valid: move to awaiting HR flow
    const { data: existingData, error: existingError } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    const existing = assertNoError({
      data: existingData,
      error: existingError,
    });

    const currentHistory = Array.isArray(existing.status_history)
      ? existing.status_history
      : [];

    const { data, error } = await supabase
      .from("swap_requests")
      .update({
        status: "accepted",
        accepted_at: now,
        status_history: [
          ...currentHistory,
          {
            status: "accepted",
            changed_at: now,
            changed_by_user_id: targetUserId,
          },
        ],
      })
      .eq("id", requestId)
      .select()
      .single();

    const updatedRequest = toSwapRequest(assertNoError({ data, error }));

    await Promise.all([
      createInAppNotification({
        userId: String(existing.requester_user_id),
        type: "swap_request",
        title: "Pedido de troca aceite",
        body: "O pedido foi aceite. Pode agora enviá-lo ao RH.",
        entityType: "swap_request",
        entityId: requestId,
      }),
      createInAppNotification({
        userId: String(existing.target_user_id),
        type: "swap_request",
        title: "Pedido de troca aceite",
        body: "Pedido aceite. Aguarda envio ao RH.",
        entityType: "swap_request",
        entityId: requestId,
      }),
    ]);

    return updatedRequest;
  },

  async sendHREmail(
    requestId: string,
    actorUserId?: string,
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const actor = actorUserId ?? null;

    const { data: requestData, error: requestError } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    const requestRow = assertNoError({
      data: requestData,
      error: requestError,
    });

    if (
      actor &&
      actor !== requestRow.requester_user_id &&
      actor !== requestRow.target_user_id
    ) {
      throw new Error("Apenas participantes da troca podem enviar para RH.");
    }

    const requesterSettings = await supabaseSwaps.getHRSettings(
      String(requestRow.requester_user_id),
    );
    const targetSettings = await supabaseSwaps.getHRSettings(
      String(requestRow.target_user_id),
    );

    const hrEmail = requesterSettings?.hrEmail || targetSettings?.hrEmail || "";
    const ccEmails =
      requesterSettings?.ccEmails ?? targetSettings?.ccEmails ?? [];

    if (!hrEmail) {
      throw new Error(
        "Email do RH não configurado. Atualize as configurações de RH antes de enviar.",
      );
    }

    const decisionLinks = await supabaseSwaps.createHrDecisionLinks({
      requestId,
      actorUserId: actor ?? undefined,
      baseUrl: `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}`,
      expiresInHours: 24,
    });

    const authHeaders = await getEdgeInvokeAuthHeaders(supabase);
    const { error: sendError } = await supabase.functions.invoke(
      "send-swap-hr-email",
      {
        headers: authHeaders,
        body: {
          request_id: requestId,
          actor_user_id: actor,
          hr_email: hrEmail,
          cc_emails: ccEmails,
          approve_url: decisionLinks.approveUrl,
          decline_url: decisionLinks.declineUrl,
          expires_at: decisionLinks.expiresAt,
        },
      },
    );

    if (sendError) {
      throw new Error(await extractInvokeErrorMessage(sendError));
    }

    const updated = await supabaseSwaps.markHREmailSent(
      requestId,
      actor ?? undefined,
    );

    await Promise.all([
      createInAppNotification({
        userId: String(requestRow.requester_user_id),
        type: "swap_request",
        title: "Pedido enviado ao RH",
        body: "O email foi enviado ao RH e foi enviada uma cópia para o utilizador que fez o envio.",
        entityType: "swap_request",
        entityId: requestId,
      }),
      createInAppNotification({
        userId: String(requestRow.target_user_id),
        type: "swap_request",
        title: "Pedido enviado ao RH",
        body: "O pedido foi enviado ao RH e aguarda decisão.",
        entityType: "swap_request",
        entityId: requestId,
      }),
      sendRequestReminderEmail({
        requestType: "swap_request",
        requestId,
        recipientUserId: String(requestRow.requester_user_id),
        reason: "submitted_to_hr",
        actorUserId: actor ?? undefined,
      }),
      sendRequestReminderEmail({
        requestType: "swap_request",
        requestId,
        recipientUserId: String(requestRow.target_user_id),
        reason: "awaiting_hr_decision",
        actorUserId: actor ?? undefined,
      }),
    ]);

    return updated;
  },

  async markHREmailSent(
    requestId: string,
    actorUserId?: string,
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data: existingData, error: existingError } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    const existing = assertNoError({
      data: existingData,
      error: existingError,
    });

    const now = new Date().toISOString();
    const currentHistory = Array.isArray(existing.status_history)
      ? existing.status_history
      : [];

    const actor = actorUserId ?? null;
    if (
      actor &&
      actor !== existing.requester_user_id &&
      actor !== existing.target_user_id
    ) {
      throw new Error("Apenas participantes da troca podem enviar para RH.");
    }

    const nextRequesterHrSent = true;
    const nextTargetHrSent = true;
    const bothSent = true;

    const patch: {
      hr_email_sent: boolean;
      requester_hr_sent: boolean;
      target_hr_sent: boolean;
      status?: SwapRequestStatus;
      submitted_to_hr_at?: string;
      status_history?: unknown[];
    } = {
      hr_email_sent: bothSent,
      requester_hr_sent: nextRequesterHrSent,
      target_hr_sent: nextTargetHrSent,
    };

    if (bothSent && existing.status !== "submitted_to_hr") {
      patch.status = "submitted_to_hr";
      patch.status_history = [
        ...currentHistory,
        {
          status: "submitted_to_hr",
          changed_at: now,
          changed_by_user_id: actor,
        },
      ];
    }

    if (!existing.submitted_to_hr_at) {
      patch.submitted_to_hr_at = now;
    }

    const { data, error } = await supabase
      .from("swap_requests")
      .update(patch)
      .eq("id", requestId)
      .select()
      .single();
    return toSwapRequest(assertNoError({ data, error }));
  },

  async markHRApproved(
    requestId: string,
    actorUserId?: string,
  ): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data: existingData, error: existingError } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    const existing = assertNoError({
      data: existingData,
      error: existingError,
    });

    const actor = actorUserId ?? null;
    if (
      actor &&
      actor !== existing.requester_user_id &&
      actor !== existing.target_user_id
    ) {
      throw new Error(
        "Apenas participantes da troca podem marcar aprovacao RH.",
      );
    }

    const now = new Date().toISOString();
    const currentHistory = Array.isArray(existing.status_history)
      ? existing.status_history
      : [];
    const requesterApproved =
      (existing as { requester_hr_approved?: boolean }).requester_hr_approved ??
      false;
    const targetApproved =
      (existing as { target_hr_approved?: boolean }).target_hr_approved ??
      false;

    const nextRequesterApproved =
      actor === existing.requester_user_id ? true : requesterApproved;
    const nextTargetApproved =
      actor === existing.target_user_id ? true : targetApproved;
    const bothApproved = nextRequesterApproved && nextTargetApproved;

    const patch: {
      requester_hr_approved: boolean;
      target_hr_approved: boolean;
      status?: SwapRequestStatus;
      approved_at?: string;
      status_history?: unknown[];
    } = {
      requester_hr_approved: nextRequesterApproved,
      target_hr_approved: nextTargetApproved,
    };

    if (bothApproved && existing.status !== "ready_to_apply") {
      patch.status = "ready_to_apply";
      patch.approved_at = now;
      patch.status_history = [
        ...currentHistory,
        {
          status: "ready_to_apply",
          changed_at: now,
          changed_by_user_id: actor,
        },
      ];
    }

    const { data, error } = await supabase
      .from("swap_requests")
      .update(patch)
      .eq("id", requestId)
      .select()
      .single();

    return toSwapRequest(assertNoError({ data, error }));
  },

  async createHrDecisionLinks(input): Promise<{
    approveUrl: string;
    declineUrl: string;
    expiresAt: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const safeBaseUrl =
      input.baseUrl ??
      `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}`;

    const { data, error } = await supabase.functions.invoke("swap-hr-actions", {
      body: {
        operation: "create",
        request_id: input.requestId,
        actor_user_id: input.actorUserId ?? null,
        base_url: safeBaseUrl,
        expires_in_hours: input.expiresInHours ?? 24,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    const response = data as {
      approve_url?: string;
      decline_url?: string;
      expires_at?: string;
    } | null;

    if (
      !response?.approve_url ||
      !response?.decline_url ||
      !response?.expires_at
    ) {
      throw new Error("Falha ao gerar links seguros de decisão para o RH.");
    }

    return {
      approveUrl: response.approve_url,
      declineUrl: response.decline_url,
      expiresAt: response.expires_at,
    };
  },

  async processHrDecisionAction(input): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke("swap-hr-actions", {
      body: {
        operation: "consume",
        token: input.token,
        action: input.action,
        actor_email: input.actorEmail ?? null,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    const response = data as { request?: { id?: string } } | null;
    const requestId = response?.request?.id;
    if (!requestId) {
      throw new Error("Resposta inválida ao processar decisão do RH.");
    }

    const { data: updatedRow, error: updatedError } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    return toSwapRequest(
      assertNoError({ data: updatedRow, error: updatedError }),
    );
  },

  async applySwap(requestId: string): Promise<SwapRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    // Fetch shift IDs before applying so we can purge stale sync records
    // after ownership changes. Old calendar_sync_records carry the previous
    // owner's sync keys; leaving them in place causes the sync engine to
    // mis-match new shifts via fuzzy fallback and emit UPDATE instead of CREATE.
    const { data: preData } = await supabase
      .from("swap_requests")
      .select("requester_shift_id, target_shift_id")
      .eq("id", requestId)
      .single();

    const { error: rpcError } = await supabase.rpc("apply_swap_request", {
      p_request_id: requestId,
    });

    if (rpcError) {
      const maybeCode =
        typeof rpcError === "object" && rpcError && "code" in rpcError
          ? String((rpcError as { code?: string }).code)
          : null;
      if (maybeCode === "PGRST202") {
        throw new Error(
          "Atualizacao de calendario indisponivel: execute as migracoes mais recentes.",
        );
      }
      const rawMessage = extractPostgrestErrorMessage(rpcError);
      throw new Error(mapApplySwapRpcMessage(rawMessage));
    }

    // Remove stale tracking records for both swapped shifts so the next
    // calendar sync always creates fresh events under the new owners.
    if (preData) {
      const shiftIds = [
        preData.requester_shift_id,
        preData.target_shift_id,
      ].filter(Boolean) as string[];

      if (shiftIds.length > 0) {
        await supabase
          .from("calendar_sync_records")
          .delete()
          .in("shift_id", shiftIds);
      }
    }

    const { data, error } = await supabase
      .from("swap_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    return toSwapRequest(assertNoError({ data, error }));
  },

  async getHRSettings(userId: string): Promise<HRSettings | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("hr_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error?.code === "PGRST116") {
      // Not found
      return null;
    }
    if (error) throw error;
    if (!data) return null;

    return toHRSettings(data);
  },

  async saveHRSettings(input: {
    userId: string;
    hrEmail: string;
    ccEmails: string[];
    selectedCalendarId?: string | null;
    selectedCalendarName?: string | null;
    lastSyncedCalendarId?: string | null;
  }): Promise<HRSettings> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase
      .from("hr_settings")
      .upsert(
        {
          user_id: input.userId,
          hr_email: input.hrEmail,
          cc_emails: input.ccEmails,
          selected_calendar_id: input.selectedCalendarId ?? null,
          selected_calendar_name: input.selectedCalendarName ?? null,
          last_synced_calendar_id: input.lastSyncedCalendarId ?? null,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    return toHRSettings(assertNoError({ data, error }));
  },
};

// ── LeaveService ───────────────────────────────────────────────────────────

const supabaseLeave: LeaveService = {
  async createLeaveRequest(
    input: Omit<
      LeaveRequest,
      | "id"
      | "status"
      | "createdAt"
      | "updatedAt"
      | "sentToHrAt"
      | "decisionDueAt"
      | "approvedStartDate"
      | "approvedEndDate"
      | "approvedNotes"
      | "hrResponseNotes"
      | "softDeclinedAt"
      | "calendarAppliedAt"
      | "googleEventId"
      | "leaveUid"
      | "lastSyncedCalendarId"
    >,
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .insert({
        user_id: input.userId,
        type: input.type,
        requested_start_date: input.startDate,
        requested_end_date: input.endDate,
        requested_notes: input.notes,
        status: "draft",
      })
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async getLeaveRequestById(id: string): Promise<LeaveRequest | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toLeaveRequest(data) : null;
  },

  async getLeaveRequestsForUser(userId: string): Promise<LeaveRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", userId)
      .order("requested_start_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toLeaveRequest);
  },

  async getLeaveRequestsForUserPaginated(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<LeaveRequest>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return toPaginatedResult({ items: [], page: 1, pageSize: 5, total: 0 });
    }

    const { page, pageSize } = normalizeQuery(query);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from("leave_requests")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("requested_start_date", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return toPaginatedResult({
      items: (data ?? []).map(toLeaveRequest),
      page,
      pageSize,
      total: count ?? 0,
    });
  },

  async createLeaveEmailPreview(input): Promise<EmailPreviewPayload> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const authHeaders = await getEdgeInvokeAuthHeaders(supabase);

    const { data, error } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("id", input.leaveRequestId)
      .single();

    if (error) throw error;
    const leave = toLeaveRequest(data);

    const safeBaseUrl = `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}`;
    const { data: linksData, error: linksError } =
      await supabase.functions.invoke("leave-hr-actions", {
        headers: authHeaders,
        body: {
          operation: "create",
          leave_request_id: leave.id,
          base_url: safeBaseUrl,
          expires_in_hours: 72,
        },
      });

    if (linksError) {
      const msg = await extractInvokeErrorMessage(linksError);
      console.error("[leave-hr-actions create] error:", msg, linksError);
      throw new Error(msg);
    }

    console.debug("[leave-hr-actions create] response:", linksData);

    const decisionLinks = linksData as {
      approve_url?: string;
      decline_url?: string;
      adjust_url?: string;
      expires_at?: string;
    } | null;

    if (
      !decisionLinks?.approve_url ||
      !decisionLinks?.decline_url ||
      !decisionLinks?.expires_at
    ) {
      throw new Error("Falha ao gerar links seguros de decisão para ausência.");
    }

    const subject = `[ShiftSync] Ação RH: pedido de ${leave.type} (${leave.startDate} a ${leave.endDate})`;
    const lines = [
      "Olá RH,",
      "",
      "Existe um novo pedido de ausência para decisão.",
      "",
      "Resumo do pedido:",
      `- Pedido por: ${input.employeeName ?? "N/D"} (${input.employeeCode ?? "N/D"})`,
      `- Tipo: ${leave.type}`,
      `- Período: ${leave.startDate} até ${leave.endDate}`,
      `- Alteração solicitada: atualização do planeamento de ausências para o período acima.`,
      `- Observações: ${leave.notes ?? "Sem observações"}`,
      `- Pedido: ${leave.id}`,
      "",
      "Ações rápidas RH (link seguro e de uso único):",
      `- Aprovar: ${decisionLinks.approve_url}`,
      `- Recusar: ${decisionLinks.decline_url}`,
      `- Ajustar datas: ${decisionLinks.adjust_url ?? "N/D"}`,
      `- Validade: ${decisionLinks.expires_at}`,
      "",
      "Após a decisão, os intervenientes serão notificados automaticamente.",
      "",
      "ShiftSync",
    ];

    return {
      subject,
      to: [input.hrEmail],
      cc: input.ccEmails ?? [],
      body: lines.join("\n"),
      attachments: (input.attachments ?? []).map((item) => ({
        fileName: item.fileName,
        fileType: item.fileType ?? null,
        fileSize: item.fileSize ?? null,
      })),
    };
  },

  async createLeaveDecisionLinks(input): Promise<{
    approveUrl: string;
    declineUrl: string;
    adjustUrl: string;
    expiresAt: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const authHeaders = await getEdgeInvokeAuthHeaders(supabase);

    const safeBaseUrl =
      input.baseUrl ??
      `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}`;

    const { data, error } = await supabase.functions.invoke(
      "leave-hr-actions",
      {
        headers: authHeaders,
        body: {
          operation: "create",
          leave_request_id: input.leaveRequestId,
          base_url: safeBaseUrl,
          expires_in_hours: input.expiresInHours ?? 72,
        },
      },
    );

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    const response = data as {
      approve_url?: string;
      decline_url?: string;
      adjust_url?: string;
      expires_at?: string;
    } | null;

    if (
      !response?.approve_url ||
      !response?.decline_url ||
      !response?.adjust_url ||
      !response?.expires_at
    ) {
      throw new Error("Falha ao gerar links seguros de decisão para ausência.");
    }

    return {
      approveUrl: response.approve_url,
      declineUrl: response.decline_url,
      adjustUrl: response.adjust_url,
      expiresAt: response.expires_at,
    };
  },

  async processLeaveDecisionAction(input): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke(
      "leave-hr-actions",
      {
        body: {
          operation: "consume",
          token: input.token,
          action: input.action,
          actor_email: input.actorEmail ?? null,
        },
      },
    );

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    const response = data as { leave_request?: { id?: string } } | null;
    const leaveRequestId = response?.leave_request?.id;
    if (!leaveRequestId) {
      throw new Error("Resposta inválida ao processar decisão do RH.");
    }

    const { data: updatedRow, error: updatedError } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("id", leaveRequestId)
      .single();

    return toLeaveRequest(
      assertNoError({ data: updatedRow, error: updatedError }),
    );
  },

  async confirmLeaveSubmission(input): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const toEmail = input.emailPreview.to[0] ?? null;
    if (!toEmail) {
      throw new Error("Email do RH em falta para concluir o envio.");
    }

    const authHeaders = await getEdgeInvokeAuthHeaders(supabase);
    const uploadedAttachments = await uploadLeaveAttachmentFiles(
      supabase,
      input.leaveRequestId,
      input.attachments,
    );

    const { error: sendError } = await supabase.functions.invoke(
      "send-leave-hr-email",
      {
        headers: authHeaders,
        body: {
          leave_request_id: input.leaveRequestId,
          actor_user_id: uploadedAttachments.actorUserId,
          hr_email: toEmail,
          cc_emails: input.emailPreview.cc,
          subject: input.emailPreview.subject,
          body: input.emailPreview.body,
          attachments: uploadedAttachments.attachments,
        },
      },
    );

    if (sendError) {
      throw new Error(await extractInvokeErrorMessage(sendError));
    }

    if (uploadedAttachments.attachments.length) {
      await (supabase as any).from("leave_request_attachments").insert(
        uploadedAttachments.attachments.map((file) => ({
          leave_request_id: input.leaveRequestId,
          user_id: uploadedAttachments.actorUserId,
          file_name: file.fileName,
          file_type: file.fileType ?? null,
          file_size: file.fileSize ?? null,
          storage_path: file.storagePath ?? null,
        })),
      );
    }

    const now = new Date().toISOString();
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: updatedRow, error: updateError } = await supabase
      .from("leave_requests")
      .update({
        status: "pending",
        sent_to_hr_at: now,
        decision_due_at: dueAt,
      })
      .eq("id", input.leaveRequestId)
      .select("*")
      .single();

    const updatedLeave = toLeaveRequest(
      assertNoError({ data: updatedRow, error: updateError }),
    );

    await createInAppNotification({
      userId: updatedLeave.userId,
      type: "leave_request",
      title: "Pedido de ausência enviado",
      body: "O pedido foi enviado ao RH e aguarda decisão.",
      entityType: "leave_request",
      entityId: updatedLeave.id,
    });

    await sendRequestReminderEmail({
      requestType: "leave_request",
      requestId: updatedLeave.id,
      recipientUserId: updatedLeave.userId,
      reason: "submitted_to_hr",
      actorUserId: uploadedAttachments.actorUserId,
    });

    return updatedLeave;
  },

  async getAttachmentsByLeaveRequest(
    leaveRequestId: string,
  ): Promise<LeaveRequestAttachment[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await (supabase as any)
      .from("leave_request_attachments")
      .select("*")
      .eq("leave_request_id", leaveRequestId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw new Error(getErrorMessage(error));
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      leaveRequestId: String(row.leave_request_id),
      userId: String(row.user_id ?? ""),
      fileName: String(row.file_name),
      fileType: (row.file_type as string | null) ?? null,
      fileSize: (row.file_size as number | null) ?? null,
      storagePath: (row.storage_path as string | null) ?? null,
      uploadedAt: String(
        row.uploaded_at ?? row.created_at ?? new Date().toISOString(),
      ),
    }));
  },

  async deleteLeaveRequest(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    await (supabase as any)
      .from("leave_request_attachments")
      .delete()
      .eq("leave_request_id", id);

    const { error } = await supabase
      .from("leave_requests")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async markSentToHR(id: string): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const now = new Date().toISOString();
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        status: "pending",
        sent_to_hr_at: now,
        decision_due_at: dueAt,
      })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async approveLeaveRequest(
    id: string,
    input?: {
      approvedStartDate?: string;
      approvedEndDate?: string;
      approvedNotes?: string;
      hrResponseNotes?: string;
    },
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    // Fetch current row to default approved dates to requested dates
    const { data: current, error: fetchError } = await supabase
      .from("leave_requests")
      .select("requested_start_date, requested_end_date")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        status: "approved",
        approved_start_date:
          input?.approvedStartDate ?? current.requested_start_date,
        approved_end_date: input?.approvedEndDate ?? current.requested_end_date,
        approved_notes: input?.approvedNotes ?? null,
        hr_response_notes: input?.hrResponseNotes ?? null,
      })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async rejectLeaveRequest(
    id: string,
    input?: { hrResponseNotes?: string },
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        status: "rejected",
        hr_response_notes: input?.hrResponseNotes ?? null,
      })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async updateApprovedDates(
    id: string,
    approvedStartDate: string,
    approvedEndDate: string,
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        approved_start_date: approvedStartDate,
        approved_end_date: approvedEndDate,
      })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  async recordCalendarSync(
    id: string,
    syncData: { googleEventId: string; leaveUid: string; calendarId: string },
  ): Promise<LeaveRequest> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");
    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        google_event_id: syncData.googleEventId,
        leave_uid: syncData.leaveUid,
        last_synced_calendar_id: syncData.calendarId,
        calendar_applied_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    return toLeaveRequest(assertNoError({ data, error }));
  },

  /** @deprecated — retained for backward-compatibility; prefer typed methods above. */
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

async function runLocalCalendarApply(input: {
  shifts: ShiftData[];
  options: {
    userId: string;
    calendarId: string;
    accessToken?: string;
    dateRange?: { start: string; end: string };
    fullResync?: boolean;
    removeStaleEvents?: boolean;
    preferPlatformChanges?: boolean;
  };
}): Promise<{
  summary: {
    created: number;
    updated: number;
    deleted: number;
    noop: number;
    failed: number;
    updatedFromGoogle: number;
  };
  changes?: Array<{
    type: "create" | "update" | "delete" | "noop";
    reason: string;
    syncShiftKey: string | null;
    date: string | null;
    start: string | null;
    end: string | null;
    title: string | null;
    location: string | null;
  }>;
  syncedShifts: ShiftData[];
  errors: Array<{ shiftId: string | null; message: string }>;
}> {
  if (!input.options.accessToken) {
    throw new Error(
      "Missing Google access token for compatibility-mode calendar sync.",
    );
  }

  const supabase = getSupabaseClient();
  let result: Awaited<
    ReturnType<InstanceType<typeof Phase3CalendarSync>["apply"]>
  >;

  if (!supabase) {
    emitCalendarSyncCompatibilityMode(true);
    const repo = makeLocalCalendarRepository(
      input.options.userId,
      input.options.calendarId,
    );
    const service = new Phase3CalendarSync(repo);
    result = await service.apply({
      shifts: input.shifts,
      accessToken: input.options.accessToken,
      options: {
        userId: input.options.userId,
        provider: "google",
        calendarId: input.options.calendarId,
        dateRange: input.options.dateRange,
        fullResync: input.options.fullResync,
        removeStaleEvents: input.options.removeStaleEvents ?? true,
        preferPlatformChanges: input.options.preferPlatformChanges,
      },
    });
  } else {
    try {
      const service = new Phase3CalendarSync(supabaseCalendarRecords);
      result = await service.apply({
        shifts: input.shifts,
        accessToken: input.options.accessToken,
        options: {
          userId: input.options.userId,
          provider: "google",
          calendarId: input.options.calendarId,
          dateRange: input.options.dateRange,
          fullResync: input.options.fullResync,
          removeStaleEvents: input.options.removeStaleEvents ?? true,
          preferPlatformChanges: input.options.preferPlatformChanges,
        },
      });
      emitCalendarSyncCompatibilityMode(false);
    } catch (err) {
      if (!isMissingCalendarSyncRecordsTable(err)) {
        throw err;
      }

      emitCalendarSyncCompatibilityMode(true);
      const repo = makeLocalCalendarRepository(
        input.options.userId,
        input.options.calendarId,
      );
      const service = new Phase3CalendarSync(repo);
      result = await service.apply({
        shifts: input.shifts,
        accessToken: input.options.accessToken,
        options: {
          userId: input.options.userId,
          provider: "google",
          calendarId: input.options.calendarId,
          dateRange: input.options.dateRange,
          fullResync: input.options.fullResync,
          removeStaleEvents: input.options.removeStaleEvents ?? true,
          preferPlatformChanges: input.options.preferPlatformChanges,
        },
      });
    }
  }

  if (supabase) {
    await persistShiftGoogleEventIds({
      userId: input.options.userId,
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
}

async function runLocalCalendarPreview(input: {
  shifts: ShiftData[];
  options: {
    userId: string;
    calendarId: string;
    accessToken?: string;
    dateRange?: { start: string; end: string };
    fullResync?: boolean;
    removeStaleEvents?: boolean;
    preferPlatformChanges?: boolean;
  };
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
}> {
  if (!input.options.accessToken) {
    throw new Error(
      "Missing Google access token for compatibility-mode calendar preview.",
    );
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    emitCalendarSyncCompatibilityMode(true);
    const repo = makeLocalCalendarRepository(
      input.options.userId,
      input.options.calendarId,
    );
    const service = new Phase3CalendarSync(repo);
    const preview = await service.preview({
      shifts: input.shifts,
      accessToken: input.options.accessToken,
      options: {
        userId: input.options.userId,
        provider: "google",
        calendarId: input.options.calendarId,
        dateRange: input.options.dateRange,
        fullResync: input.options.fullResync,
        removeStaleEvents: input.options.removeStaleEvents ?? true,
        preferPlatformChanges: input.options.preferPlatformChanges,
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
      shifts: input.shifts,
      accessToken: input.options.accessToken,
      options: {
        userId: input.options.userId,
        provider: "google",
        calendarId: input.options.calendarId,
        dateRange: input.options.dateRange,
        fullResync: input.options.fullResync,
        removeStaleEvents: input.options.removeStaleEvents ?? true,
        preferPlatformChanges: input.options.preferPlatformChanges,
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
      input.options.userId,
      input.options.calendarId,
    );
    const service = new Phase3CalendarSync(repo);
    const preview = await service.preview({
      shifts: input.shifts,
      accessToken: input.options.accessToken,
      options: {
        userId: input.options.userId,
        provider: "google",
        calendarId: input.options.calendarId,
        dateRange: input.options.dateRange,
        fullResync: input.options.fullResync,
        removeStaleEvents: input.options.removeStaleEvents ?? true,
        preferPlatformChanges: input.options.preferPlatformChanges,
      },
    });
    return {
      summary: preview.summary,
      changes: preview.changes,
    };
  }
}

const supabaseCalendar: CalendarSyncService = {
  async syncShifts(
    shifts: Shift[],
    accessToken: string,
    calendarId: string,
  ): Promise<{ created: number; updated: number; deleted: number }> {
    // Legacy path kept for backward compatibility. Prefer runSync for new callers.
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
    if (!supabase) {
      return runLocalCalendarApply({
        shifts,
        options,
      });
    }

    try {
      const { data, error } = await supabase.functions.invoke("calendar-sync", {
        body: {
          action: "apply",
          userId: options.userId,
          calendarId: options.calendarId,
          dateRange: options.dateRange,
          fullResync: options.fullResync,
          removeStaleEvents: options.removeStaleEvents,
          shifts,
        },
      });

      if (error) {
        throw new Error(await extractInvokeErrorMessage(error));
      }

      emitCalendarSyncCompatibilityMode(false);
      return data as Awaited<ReturnType<CalendarSyncService["runSync"]>>;
    } catch (error) {
      console.warn("[CalendarSync][Backend] apply edge function failed", {
        user_id: options.userId,
        calendar_id: options.calendarId,
        message: getErrorMessage(error),
      });

      return runLocalCalendarApply({
        shifts,
        options,
      });
    }
  },

  async previewSync(shifts, options) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return runLocalCalendarPreview({ shifts, options });
    }

    try {
      const { data, error } = await supabase.functions.invoke("calendar-sync", {
        body: {
          action: "preview",
          userId: options.userId,
          calendarId: options.calendarId,
          dateRange: options.dateRange,
          fullResync: options.fullResync,
          removeStaleEvents: options.removeStaleEvents,
          shifts,
        },
      });

      if (error) {
        throw new Error(await extractInvokeErrorMessage(error));
      }

      emitCalendarSyncCompatibilityMode(false);
      return data as Awaited<ReturnType<CalendarSyncService["previewSync"]>>;
    } catch (error) {
      console.warn("[CalendarSync][Backend] preview edge function failed", {
        user_id: options.userId,
        calendar_id: options.calendarId,
        message: getErrorMessage(error),
      });

      return runLocalCalendarPreview({ shifts, options });
    }
  },

  async connectGoogleCalendar(userId, input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "connect",
        userId,
        ...input,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    return data as Awaited<ReturnType<CalendarSyncService["connectGoogleCalendar"]>>;
  },

  async updateConnection(userId, input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "update_connection",
        userId,
        ...input,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    return data as Awaited<ReturnType<CalendarSyncService["updateConnection"]>>;
  },

  async getConnectionStatus(userId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "status",
        userId,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    return data as Awaited<ReturnType<CalendarSyncService["getConnectionStatus"]>>;
  },

  async triggerSync(input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "trigger",
        ...input,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    return data as Awaited<ReturnType<CalendarSyncService["triggerSync"]>>;
  },

  async pullLatestGoogleChanges(input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "pull",
        ...input,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }

    return data as Awaited<
      ReturnType<CalendarSyncService["pullLatestGoogleChanges"]>
    >;
  },

  async disconnectProvider(userId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { error } = await supabase.functions.invoke("calendar-sync", {
      body: {
        action: "disconnect",
        userId,
      },
    });

    if (error) {
      throw new Error(await extractInvokeErrorMessage(error));
    }
  },
};

// ── NotificationService ────────────────────────────────────────────────────

const supabaseNotifications: NotificationService = {
  async notifyHR(_subject: string, _body: string): Promise<void> {
    // Stub: will be wired to Supabase Edge Function or email trigger in Phase 7.
    console.info("[NotificationService] notifyHR called (stub)");
  },

  async notifyLeaveStatusChange(
    payload: LeaveNotificationPayload,
  ): Promise<void> {
    // Stub: structured payload ready for Supabase Edge Function invocation.
    // When a `notify-leave-status` Edge Function is deployed, replace with:
    //   const supabase = getSupabaseClient();
    //   await supabase?.functions.invoke("notify-leave-status", { body: payload });
    console.info("[NotificationService] notifyLeaveStatusChange", payload);
  },

  async backfillSwapRequestNotifications(userId: string): Promise<number> {
    const supabase = getSupabaseClient();
    if (!supabase) return 0;

    const { data: requests, error: requestsError } = await (supabase as any)
      .from("swap_requests")
      .select("id, requester_user_id, target_user_id, created_at")
      .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (requestsError) {
      throw new Error(getErrorMessage(requestsError));
    }

    const candidateRequests = (requests ?? []) as Array<{
      id: string;
      requester_user_id: string;
      target_user_id: string;
      created_at?: string | null;
    }>;

    if (candidateRequests.length === 0) {
      return 0;
    }

    const requestIds = candidateRequests.map((request) => String(request.id));

    const { data: existingRows, error: existingError } = await (supabase as any)
      .from("notifications")
      .select("entity_id")
      .eq("user_id", userId)
      .eq("entity_type", "swap_request")
      .eq("type", "swap_request")
      .in("entity_id", requestIds);

    if (existingError) {
      throw new Error(getErrorMessage(existingError));
    }

    const existingEntityIds = new Set(
      (existingRows ?? []).map((row: Record<string, unknown>) =>
        String(row.entity_id),
      ),
    );

    const rowsToInsert = candidateRequests
      .filter((request) => !existingEntityIds.has(String(request.id)))
      .map((request) => {
        const isTargetUser = String(request.target_user_id) === userId;
        return {
          user_id: userId,
          type: "swap_request",
          title: isTargetUser
            ? "Novo pedido de troca"
            : "Pedido de troca enviado",
          body: isTargetUser
            ? "Recebeste um novo pedido de troca para análise."
            : "O pedido foi enviado e aguarda resposta do colega.",
          entity_type: "swap_request",
          entity_id: request.id,
          created_at: request.created_at ?? new Date().toISOString(),
        };
      });

    if (rowsToInsert.length === 0) {
      return 0;
    }

    const { error: insertError } = await (supabase as any)
      .from("notifications")
      .insert(rowsToInsert);

    if (insertError) {
      throw new Error(getErrorMessage(insertError));
    }

    return rowsToInsert.length;
  },

  async listNotifications(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<AppNotification>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return toPaginatedResult({ items: [], page: 1, pageSize: 5, total: 0 });
    }

    const { page, pageSize } = normalizeQuery(query);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await (supabase as any)
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(getErrorMessage(error));

    const items: AppNotification[] = (data ?? []).map(
      (row: Record<string, unknown>) => ({
        id: String(row.id),
        userId: String(row.user_id),
        type: (row.type as AppNotification["type"]) ?? "reminder",
        title: String(row.title ?? "Notificação"),
        body: String(row.body ?? ""),
        link: (row.link as string | null) ?? null,
        entityType: (row.entity_type as string | null) ?? null,
        entityId: (row.entity_id as string | null) ?? null,
        meta: (row.meta as Record<string, unknown>) ?? {},
        isRead:
          typeof row.is_read === "boolean"
            ? Boolean(row.is_read)
            : Boolean(row.read_at),
        readAt: (row.read_at as string | null) ?? null,
        createdAt: String(row.created_at),
      }),
    );

    return toPaginatedResult({
      items,
      page,
      pageSize,
      total: count ?? 0,
    });
  },

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { error } = await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { error } = await (supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  async getUnreadCount(userId: string): Promise<number> {
    const supabase = getSupabaseClient();
    if (!supabase) return 0;

    const { count, error } = await (supabase as any)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      throw new Error(getErrorMessage(error));
    }

    return Number(count ?? 0);
  },
};

const supabaseWorkflow: WorkflowService = {
  async createActionToken(input): Promise<WorkflowActionToken> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const token = createSecureToken();
    const expiresAt = new Date(
      Date.now() + input.expiresInMinutes * 60 * 1000,
    ).toISOString();

    const { data, error } = await (supabase as any)
      .from("action_tokens")
      .insert({
        workflow_type: input.workflowType,
        target_id: input.targetId,
        token,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (error) throw new Error(getErrorMessage(error));

    return {
      id: String(data.id),
      workflowType: "swap_hr_decision",
      targetId: String(data.target_id),
      token: String(data.token),
      expiresAt: String(data.expires_at),
      consumedAt: (data.consumed_at as string | null) ?? null,
      consumedBy: (data.consumed_by as string | null) ?? null,
      action: (data.action as "approve" | "decline" | null) ?? null,
      createdAt: String(data.created_at ?? new Date().toISOString()),
    };
  },

  async validateActionToken(
    token: string,
  ): Promise<WorkflowActionValidationResult> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await (supabase as any)
      .from("action_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) return { valid: false, reason: "token_not_found" };
    if (data.consumed_at) return { valid: false, reason: "already_consumed" };
    if (new Date(String(data.expires_at)).getTime() < Date.now()) {
      return { valid: false, reason: "expired" };
    }

    return {
      valid: true,
      tokenId: String(data.id),
      targetId: String(data.target_id),
      workflowType: "swap_hr_decision",
    };
  },

  async consumeActionToken(input): Promise<WorkflowActionValidationResult> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await (supabase as any)
      .from("action_tokens")
      .select("*")
      .eq("token", input.token)
      .maybeSingle();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) return { valid: false, reason: "token_not_found" };
    if (data.consumed_at) return { valid: false, reason: "already_consumed" };
    if (new Date(String(data.expires_at)).getTime() < Date.now()) {
      return { valid: false, reason: "expired" };
    }

    const validation: WorkflowActionValidationResult = {
      valid: true,
      tokenId: String(data.id),
      targetId: String(data.target_id),
      workflowType: "swap_hr_decision",
    };
    if (!validation.valid) return validation;

    await (supabase as any)
      .from("action_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        consumed_by: input.actorEmail ?? null,
        action: input.action,
      })
      .eq("id", validation.tokenId);

    return {
      ...validation,
      valid: true,
    };
  },
};

const supabaseReminders: ReminderService = {
  async createReminder(input): Promise<ReminderJob> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await (supabase as any)
      .from("reminder_jobs")
      .insert({
        user_id: input.userId,
        type: input.type,
        status: "pending",
        trigger_at: input.triggerAt,
        payload: input.payload ?? {},
      })
      .select("*")
      .single();

    if (error) throw new Error(getErrorMessage(error));

    await createInAppNotification({
      userId: input.userId,
      type: "reminder",
      title: "Lembrete agendado",
      body: "Foi agendado um lembrete para pedidos pontuais de dias de folga.",
      entityType: "reminder_job",
      entityId: String(data.id),
    });

    return {
      id: String(data.id),
      userId: String(data.user_id),
      type: "days_off_selection",
      status: (data.status as ReminderJob["status"]) ?? "pending",
      triggerAt: String(data.trigger_at),
      payload: (data.payload as Record<string, unknown>) ?? {},
      sentAt: (data.sent_at as string | null) ?? null,
      createdAt: String(data.created_at ?? new Date().toISOString()),
    };
  },

  async getRemindersByUser(
    userId: string,
    query: PaginatedQuery,
  ): Promise<PaginatedResult<ReminderJob>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return toPaginatedResult({ items: [], page: 1, pageSize: 5, total: 0 });
    }

    const { page, pageSize } = normalizeQuery(query);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await (supabase as any)
      .from("reminder_jobs")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(getErrorMessage(error));

    const items: ReminderJob[] = (data ?? []).map(
      (row: Record<string, unknown>) => ({
        id: String(row.id),
        userId: String(row.user_id),
        type: "days_off_selection",
        status: (row.status as ReminderJob["status"]) ?? "pending",
        triggerAt: String(row.trigger_at),
        payload: (row.payload as Record<string, unknown>) ?? {},
        sentAt: (row.sent_at as string | null) ?? null,
        createdAt: String(row.created_at ?? new Date().toISOString()),
      }),
    );

    return toPaginatedResult({
      items,
      page,
      pageSize,
      total: count ?? 0,
    });
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
  workflow = supabaseWorkflow;
  reminders = supabaseReminders;
}
