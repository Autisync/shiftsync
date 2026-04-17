import { getBackend } from "@/services/backend/backend-provider";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { ShiftData, ParsedScheduleResult } from "@/types/shift";
import { buildShiftUidFromShift } from "@/shared/utils/shift-uid";

export interface UploadPersistenceResult {
  uploadId: string;
  fileHash: string;
  resolvedSelectedShifts: ShiftData[];
}

type UploadTrustDraft = {
  trustLevel: "high" | "medium" | "low";
  trustScore: number;
  trustReason: string;
  normalizedCoverageStart: string | null;
  normalizedCoverageEnd: string | null;
  conflictsCount: number;
};

function normalizedWindowKeysFromSelectedShifts(
  shifts: ShiftData[],
): Set<string> {
  return new Set(
    shifts.map((shift) =>
      [
        toIsoDate(shift.date),
        normalizeTime(shift.startTime),
        normalizeTime(shift.endTime),
      ].join("|"),
    ),
  );
}

function normalizedWindowKeysFromUploadMeta(
  uploadMeta: Record<string, unknown>,
): Set<string> {
  const payload = Array.isArray(uploadMeta.parsed_payload)
    ? (uploadMeta.parsed_payload as Array<Record<string, unknown>>)
    : [];

  return new Set(
    payload.map((row) => {
      const date = String(row.date ?? "");
      const start =
        typeof row.starts_at === "string" ? hhmmFromIso(row.starts_at) : "";
      const end =
        typeof row.ends_at === "string" ? hhmmFromIso(row.ends_at) : "";
      return [date, start, end].join("|");
    }),
  );
}

function windowSimilarityScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const key of a) {
    if (b.has(key)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(date: Date, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const copy = new Date(date);
  copy.setHours(h || 0, m || 0, 0, 0);
  return copy.toISOString();
}

function flattenParsedPayload(parsed: ParsedScheduleResult) {
  return parsed.employees.flatMap((employee) =>
    employee.shifts.map((shift) => ({
      employee_id: employee.employeeId,
      employee_name: employee.employeeName,
      date: toIsoDate(shift.date),
      starts_at: toIsoDateTime(shift.date, shift.startTime),
      ends_at: toIsoDateTime(shift.date, shift.endTime),
      role: shift.shiftType,
      location: shift.location,
    })),
  );
}

function roleFromShift(shift: ShiftData): string {
  if (shift.notes && shift.notes.trim()) {
    return shift.notes.trim();
  }

  return shift.shiftType;
}

function identityKey(input: {
  date: string;
  startTime: string;
  endTime: string;
}): string {
  return [input.date, input.startTime, input.endTime].join("|");
}

function normalizeTime(value: string): string {
  const [hRaw, mRaw] = value.trim().split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  const hh = Number.isFinite(h) ? String(h).padStart(2, "0") : "00";
  const mm = Number.isFinite(m) ? String(m).padStart(2, "0") : "00";
  return `${hh}:${mm}`;
}

function hhmmFromIso(value: string): string {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (60 * 1000);
}

function monthRangeFromDates(dates: string[]): { start: string; end: string } {
  const sorted = [...dates].sort();
  const min = new Date(`${sorted[0]}T00:00:00.000Z`);
  const max = new Date(`${sorted[sorted.length - 1]}T00:00:00.000Z`);

  const monthStart = new Date(
    Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 0),
  );

  return {
    start: monthStart.toISOString().slice(0, 10),
    end: monthEnd.toISOString().slice(0, 10),
  };
}

type ExistingShiftCandidate = {
  shiftUid: string;
  date: string;
  role: string | null;
  location: string | null;
  startsAt: string;
};

function chooseReusableUid(input: {
  shift: ShiftData;
  strictIdentityUid: string | undefined;
  candidates: ExistingShiftCandidate[];
  usedUids: Set<string>;
}): string | undefined {
  if (input.strictIdentityUid && !input.usedUids.has(input.strictIdentityUid)) {
    return input.strictIdentityUid;
  }

  const targetStart = new Date(
    toIsoDateTime(input.shift.date, input.shift.startTime),
  );
  const targetRole = normalizeText(roleFromShift(input.shift));
  const targetLocation = normalizeText(input.shift.location ?? null);

  const scored = input.candidates
    .filter((candidate) => !input.usedUids.has(candidate.shiftUid))
    .map((candidate) => {
      const candidateRole = normalizeText(candidate.role);
      const candidateLocation = normalizeText(candidate.location);

      // Prefer same location strongly. If both locations are present and differ,
      // treat as non-match to avoid cross-location accidental merges.
      if (
        targetLocation &&
        candidateLocation &&
        targetLocation !== candidateLocation
      ) {
        return null;
      }

      const startDeltaMinutes = minutesBetween(
        targetStart,
        new Date(candidate.startsAt),
      );

      // Conservative reconciliation window: 48h.
      if (startDeltaMinutes > 48 * 60) {
        return null;
      }

      const targetDate = toIsoDate(input.shift.date);
      const dateDeltaDays =
        Math.abs(
          new Date(`${candidate.date}T00:00:00.000Z`).getTime() -
            new Date(`${targetDate}T00:00:00.000Z`).getTime(),
        ) /
        (24 * 60 * 60 * 1000);

      // Avoid matching very far dates even if time-of-day is similar.
      if (dateDeltaDays > 2) {
        return null;
      }

      const locationPenalty =
        targetLocation &&
        candidateLocation &&
        targetLocation === candidateLocation
          ? 0
          : 300;
      const rolePenalty = targetRole && candidateRole === targetRole ? 0 : 120;
      const datePenalty = dateDeltaDays === 0 ? 0 : dateDeltaDays * 60;

      return {
        uid: candidate.shiftUid,
        score: startDeltaMinutes + locationPenalty + rolePenalty + datePenalty,
      };
    })
    .filter((value): value is { uid: string; score: number } => value !== null)
    .sort((a, b) => a.score - b.score);

  if (scored.length === 0) {
    return undefined;
  }

  if (scored.length === 1) {
    return scored[0].uid;
  }

  // Avoid ambiguous reassignment when two candidates are equally good.
  if (scored[0].score === scored[1].score) {
    return undefined;
  }

  return scored[0].uid;
}

function isShiftLifecycleUnavailable(error: unknown): boolean {
  const message =
    error && typeof error === "object"
      ? String((error as { message?: string }).message ?? "").toLowerCase()
      : "";

  return (
    message.includes("column") &&
    (message.includes("shift_uid") ||
      message.includes("upload_batch_id") ||
      message.includes("last_seen_at"))
  );
}

function shouldRetryLegacyShiftUpsert(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = String((error as { code?: string }).code ?? "");
  const message = String(
    (error as { message?: string }).message ?? "",
  ).toLowerCase();

  const missingConflictTarget =
    code === "42P10" ||
    message.includes(
      "no unique or exclusion constraint matching the on conflict specification",
    );

  const legacyUniqueConflict =
    code === "23505" &&
    message.includes("shifts_user_id_starts_at_ends_at_key");

  return missingConflictTarget || legacyUniqueConflict;
}

function hasConstraintConflict(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = String((error as { code?: string }).code ?? "");
  const message = String(
    (error as { message?: string }).message ?? "",
  ).toLowerCase();
  const details = String(
    (error as { details?: string }).details ?? "",
  ).toLowerCase();
  const needle = constraint.toLowerCase();

  return (
    code === "23505" && (message.includes(needle) || details.includes(needle))
  );
}

type ShiftUpsertRow = {
  user_id: string;
  shift_uid: string;
  date: string;
  starts_at: string;
  ends_at: string;
  role: string;
  location: string | null;
  source_upload_id: string;
  upload_batch_id: string;
  last_seen_at: string;
  status: "active";
};

async function upsertRowsSequentially(
  supabase: ReturnType<typeof getSupabaseClient>,
  rows: ShiftUpsertRow[],
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  for (const row of rows) {
    const { error } = await supabase.from("shifts").upsert(row, {
      onConflict: "user_id,shift_uid",
    });

    if (!error) {
      continue;
    }

    if (!hasConstraintConflict(error, "shifts_user_id_starts_at_ends_at_key")) {
      throw error;
    }

    const updatePayload = {
      shift_uid: row.shift_uid,
      date: row.date,
      role: row.role,
      location: row.location,
      source_upload_id: row.source_upload_id,
      upload_batch_id: row.upload_batch_id,
      last_seen_at: row.last_seen_at,
      status: row.status,
    };

    const { error: updateByTimeError } = await supabase
      .from("shifts")
      .update(updatePayload)
      .eq("user_id", row.user_id)
      .eq("starts_at", row.starts_at)
      .eq("ends_at", row.ends_at);

    if (!updateByTimeError) {
      continue;
    }

    if (
      !hasConstraintConflict(updateByTimeError, "shifts_user_shift_uid_key")
    ) {
      throw updateByTimeError;
    }

    const { error: updateByUidError } = await supabase
      .from("shifts")
      .update({
        date: row.date,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        role: row.role,
        location: row.location,
        source_upload_id: row.source_upload_id,
        upload_batch_id: row.upload_batch_id,
        last_seen_at: row.last_seen_at,
        status: row.status,
      })
      .eq("user_id", row.user_id)
      .eq("shift_uid", row.shift_uid);

    if (updateByUidError) {
      throw updateByUidError;
    }
  }
}

function dedupeShiftRows(rows: ShiftUpsertRow[]): ShiftUpsertRow[] {
  const byLegacyKey = new Map<string, ShiftUpsertRow>();
  const byShiftUid = new Map<string, ShiftUpsertRow>();

  for (const row of rows) {
    const existingByUid = byShiftUid.get(row.shift_uid);
    if (existingByUid) {
      const existingLegacy = `${existingByUid.user_id}|${existingByUid.starts_at}|${existingByUid.ends_at}`;
      const incomingLegacy = `${row.user_id}|${row.starts_at}|${row.ends_at}`;
      if (existingLegacy !== incomingLegacy) {
        console.error(
          "[UploadShiftIdentity] duplicate shift_uid detected in same upload",
          {
            user_id: row.user_id,
            shift_uid: row.shift_uid,
            existing_date: existingByUid.date,
            incoming_date: row.date,
          },
        );
      }
      continue;
    }

    const key = `${row.user_id}|${row.starts_at}|${row.ends_at}`;
    if (byLegacyKey.has(key)) {
      console.error(
        "[UploadShiftIdentity] duplicate row detected in same upload",
        {
          user_id: row.user_id,
          date: row.date,
          start_time: hhmmFromIso(row.starts_at),
          end_time: hhmmFromIso(row.ends_at),
          shift_uid: row.shift_uid,
        },
      );
      continue;
    }

    byLegacyKey.set(key, row);
    byShiftUid.set(row.shift_uid, row);
  }

  return [...byLegacyKey.values()];
}

async function upsertParsedShifts(input: {
  userId: string;
  uploadId: string;
  selectedEmployeeShifts: ShiftData[];
}): Promise<ShiftData[]> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase || input.selectedEmployeeShifts.length === 0) {
      return input.selectedEmployeeShifts;
    }

    const nowIso = new Date().toISOString();
    const rangeDates = input.selectedEmployeeShifts.map((shift) =>
      toIsoDate(shift.date),
    );
    const lifecycleRange = monthRangeFromDates(rangeDates);
    const minDate = lifecycleRange.start;
    const maxDate = lifecycleRange.end;

    // Reuse existing shift_uid by date/role/location so hour changes update
    // the same logical shift instead of creating a new one.
    const { data: existingRows, error: existingError } = await supabase
      .from("shifts")
      .select("shift_uid, date, role, location, starts_at, ends_at")
      .eq("user_id", input.userId)
      .eq("status", "active")
      .gte("date", minDate)
      .lte("date", maxDate);

    if (existingError) {
      throw existingError;
    }

    const existingUidByIdentity = new Map<string, string>(
      (existingRows ?? []).map((row) => [
        identityKey({
          date: row.date as string,
          startTime: hhmmFromIso(row.starts_at as string),
          endTime: hhmmFromIso(row.ends_at as string),
        }),
        row.shift_uid as string,
      ]),
    );

    const existingCandidates: ExistingShiftCandidate[] = (
      existingRows ?? []
    ).map((row) => ({
      shiftUid: row.shift_uid as string,
      date: row.date as string,
      role: (row.role as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      startsAt: row.starts_at as string,
    }));

    const usedUids = new Set<string>();
    const resolvedUidByShiftId = new Map<string, string>();

    const rows: ShiftUpsertRow[] = input.selectedEmployeeShifts.map((shift) => {
      const role = roleFromShift(shift);
      const date = toIsoDate(shift.date);
      const location = shift.location ?? null;
      const fallbackUid = buildShiftUidFromShift(shift, input.userId);
      const strictIdentityUid = existingUidByIdentity.get(
        identityKey({
          date,
          startTime: normalizeTime(shift.startTime),
          endTime: normalizeTime(shift.endTime),
        }),
      );
      const shiftUid =
        chooseReusableUid({
          shift,
          strictIdentityUid,
          candidates: existingCandidates,
          usedUids,
        }) ?? fallbackUid;
      usedUids.add(shiftUid);
      resolvedUidByShiftId.set(shift.id, shiftUid);

      console.info("[UploadShiftIdentity] generated", {
        stage: "upload-parse",
        upload_id: input.uploadId,
        shift_uid: shiftUid,
        user_id: input.userId,
        date,
        start_time: normalizeTime(shift.startTime),
        end_time: normalizeTime(shift.endTime),
      });

      return {
        user_id: input.userId,
        shift_uid: shiftUid,
        date,
        starts_at: toIsoDateTime(shift.date, shift.startTime),
        ends_at: toIsoDateTime(shift.date, shift.endTime),
        role,
        location,
        source_upload_id: input.uploadId,
        upload_batch_id: input.uploadId,
        last_seen_at: nowIso,
        status: "active",
      };
    });

    const upsertRows = dedupeShiftRows(rows);

    const { error } = await supabase.from("shifts").upsert(upsertRows, {
      onConflict: "user_id,shift_uid",
    });

    if (error && shouldRetryLegacyShiftUpsert(error)) {
      console.warn(
        "[UploadShiftIdentity] falling back to legacy onConflict key",
        {
          user_id: input.userId,
          upload_id: input.uploadId,
          code: (error as { code?: string }).code ?? null,
          message: (error as { message?: string }).message ?? String(error),
        },
      );

      const { error: legacyError } = await supabase
        .from("shifts")
        .upsert(upsertRows, {
          onConflict: "user_id,starts_at,ends_at",
        });

      if (legacyError) {
        if (hasConstraintConflict(legacyError, "shifts_user_shift_uid_key")) {
          console.warn(
            "[UploadShiftIdentity] legacy fallback conflicted on shift_uid; retrying sequential reconciliation",
            {
              user_id: input.userId,
              upload_id: input.uploadId,
            },
          );
          await upsertRowsSequentially(supabase, upsertRows);
        } else {
          throw legacyError;
        }
      }
    } else if (error) {
      if (hasConstraintConflict(error, "shifts_user_shift_uid_key")) {
        console.warn(
          "[UploadShiftIdentity] shift_uid unique conflict detected; retrying sequential reconciliation",
          {
            user_id: input.userId,
            upload_id: input.uploadId,
          },
        );
        await upsertRowsSequentially(supabase, upsertRows);
      } else {
        throw error;
      }
    }

    const { error: deleteMarkError } = await supabase
      .from("shifts")
      .update({ status: "deleted" })
      .eq("user_id", input.userId)
      .neq("upload_batch_id", input.uploadId)
      .eq("status", "active")
      .gte("date", minDate)
      .lte("date", maxDate);

    if (deleteMarkError) {
      throw deleteMarkError;
    }

    const shiftUids = upsertRows.map((row) => row.shift_uid);
    const { data: dbRows, error: fetchError } = await supabase
      .from("shifts")
      .select("shift_uid, google_event_id, date, starts_at, ends_at")
      .eq("user_id", input.userId)
      .in("shift_uid", shiftUids);

    if (fetchError) {
      throw fetchError;
    }

    const { data: deletedRows, error: deletedFetchError } = await supabase
      .from("shifts")
      .select(
        "id, shift_uid, date, starts_at, ends_at, role, location, google_event_id",
      )
      .eq("user_id", input.userId)
      .eq("status", "deleted")
      .neq("upload_batch_id", input.uploadId)
      .gte("date", minDate)
      .lte("date", maxDate);

    if (deletedFetchError) {
      throw deletedFetchError;
    }

    const googleByUid = new Map<string, string | null>(
      (dbRows ?? []).map((row) => [
        row.shift_uid as string,
        row.google_event_id as string | null,
      ]),
    );

    console.info("[UploadShiftIdentity] database-state", {
      stage: "post-upsert",
      upload_id: input.uploadId,
      user_id: input.userId,
      shifts: (dbRows ?? []).map((row) => ({
        shift_uid: row.shift_uid,
        google_event_id: row.google_event_id,
        date: row.date,
        start_time: hhmmFromIso(row.starts_at as string),
        end_time: hhmmFromIso(row.ends_at as string),
      })),
    });

    const activeShifts = input.selectedEmployeeShifts.map((shift) => {
      const shiftUid =
        resolvedUidByShiftId.get(shift.id) ??
        buildShiftUidFromShift(shift, input.userId);
      return {
        ...shift,
        shiftUid,
        googleEventId: googleByUid.get(shiftUid) ?? shift.googleEventId,
      };
    });

    const deletedStaleShifts: ShiftData[] = (deletedRows ?? []).map((row) => {
      const date = new Date(`${row.date as string}T00:00:00`);
      return {
        id: `deleted-${row.id as string}`,
        shiftUid: row.shift_uid as string,
        week: 0,
        date,
        startTime: hhmmFromIso(row.starts_at as string),
        endTime: hhmmFromIso(row.ends_at as string),
        shiftType: "other",
        status: "deleted",
        notes: (row.role as string | null) ?? undefined,
        location: (row.location as string | null) ?? undefined,
        googleEventId: (row.google_event_id as string | null) ?? undefined,
      };
    });

    return [...activeShifts, ...deletedStaleShifts];
  } catch (error) {
    if (!isShiftLifecycleUnavailable(error)) {
      throw error;
    }

    // Compatibility mode until Phase 3 migration is applied remotely.
    return input.selectedEmployeeShifts.map((shift) => ({
      ...shift,
      shiftUid: buildShiftUidFromShift(shift, input.userId),
    }));
  }
}

async function sha256Hex(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function persistUploadMetadata(params: {
  userId: string;
  file: File;
  consentToShare: boolean;
  parsedResult: ParsedScheduleResult;
  selectedEmployeeName?: string;
  selectedEmployeeShifts?: ShiftData[];
}): Promise<UploadPersistenceResult> {
  const backend = getBackend();
  const fileHash = await sha256Hex(params.file);
  const selectedShifts = params.selectedEmployeeShifts ?? [];

  const trustDraft: UploadTrustDraft = {
    trustLevel: "medium",
    trustScore: 65,
    trustReason: "Primeiro upload para este ficheiro/cobertura.",
    normalizedCoverageStart: null,
    normalizedCoverageEnd: null,
    conflictsCount: 0,
  };

  if (selectedShifts.length > 0) {
    const shiftDates = selectedShifts.map((shift) => toIsoDate(shift.date));
    const coverage = monthRangeFromDates(shiftDates);
    trustDraft.normalizedCoverageStart = coverage.start;
    trustDraft.normalizedCoverageEnd = coverage.end;

    try {
      const previousUploads = await backend.uploads.getUploadsByUser(
        params.userId,
      );
      const currentWindowKeys =
        normalizedWindowKeysFromSelectedShifts(selectedShifts);
      const selectedShiftCount = selectedShifts.length;
      const selectedEmployee = normalizeText(params.selectedEmployeeName ?? "");

      const sameHashCount = previousUploads.filter(
        (row) => row.fileHash === fileHash,
      ).length;
      const sameCoverageCount = previousUploads.filter((row) => {
        if (!row.normalizedCoverageStart || !row.normalizedCoverageEnd) {
          return false;
        }
        return (
          row.normalizedCoverageStart === coverage.start &&
          row.normalizedCoverageEnd === coverage.end
        );
      }).length;

      const sameShiftCount = previousUploads.filter((row) => {
        const count = Number(
          (row.metadata?.selected_shift_count as number | null) ?? 0,
        );
        return count > 0 && count === selectedShiftCount;
      }).length;

      const sameEmployeeCount = previousUploads.filter((row) => {
        const employee = normalizeText(
          String(row.metadata?.selected_employee_name ?? ""),
        );
        return selectedEmployee.length > 0 && employee === selectedEmployee;
      }).length;

      const corroboratingUploads = previousUploads.filter((row) => {
        const isCoverageMatch =
          row.normalizedCoverageStart === coverage.start &&
          row.normalizedCoverageEnd === coverage.end;
        return isCoverageMatch && row.fileHash !== fileHash;
      }).length;

      const bestWindowSimilarity = previousUploads.reduce((best, row) => {
        const keys = normalizedWindowKeysFromUploadMeta(row.metadata ?? {});
        return Math.max(best, windowSimilarityScore(currentWindowKeys, keys));
      }, 0);

      const existingShifts = await backend.shifts.getShiftsForUser(
        params.userId,
      );
      const existingInCoverage = existingShifts.filter((row) => {
        if (row.status !== "active") return false;
        return row.date >= coverage.start && row.date <= coverage.end;
      });
      const existingWindowKeys = new Set(
        existingInCoverage.map((row) =>
          [row.date, hhmmFromIso(row.startsAt), hhmmFromIso(row.endsAt)].join(
            "|",
          ),
        ),
      );

      let conflictsCount = 0;
      for (const key of existingWindowKeys) {
        if (!currentWindowKeys.has(key)) {
          conflictsCount += 1;
        }
      }
      trustDraft.conflictsCount = conflictsCount;

      let score = 20;
      if (sameHashCount > 0) score = 100;
      if (sameHashCount === 0) {
        if (sameCoverageCount > 0) score += 20;
        if (sameShiftCount > 0) score += 10;
        if (sameEmployeeCount > 0) score += 10;
        score += Math.round(bestWindowSimilarity * 30);
        score += Math.min(20, corroboratingUploads * 10);
        score -= Math.min(40, conflictsCount * 10);
      }

      score = Math.max(20, Math.min(100, score));
      trustDraft.trustScore = score;
      trustDraft.trustLevel =
        score >= 80 ? "high" : score >= 50 ? "medium" : "low";

      if (score === 100) {
        trustDraft.trustReason =
          "Hash exato confirmado para o mesmo utilizador (100%).";
      } else if (score >= 80) {
        trustDraft.trustReason =
          "Cobertura e estrutura de turnos corroboradas por uploads anteriores.";
      } else if (score >= 50) {
        trustDraft.trustReason =
          "Consistência parcial: cobertura semelhante com algumas divergências.";
      } else {
        trustDraft.trustReason =
          "Upload com conflitos relevantes face ao estado atual. Rever antes de sincronizar.";
      }
    } catch {
      // Keep conservative defaults if trust context lookup fails.
    }
  }

  const upload = await backend.uploads.createUpload({
    uploaderUserId: params.userId,
    fileHash,
    consentToShare: params.consentToShare,
    metadata: {
      source: "phase-2-client-upload",
      file_name: params.file.name,
      file_size: params.file.size,
      mime_type: params.file.type,
      selected_employee_name: params.selectedEmployeeName ?? null,
      selected_shift_count: selectedShifts.length,
      normalized_coverage_start: trustDraft.normalizedCoverageStart,
      normalized_coverage_end: trustDraft.normalizedCoverageEnd,
      trust_level: trustDraft.trustLevel,
      trust_score: trustDraft.trustScore,
      trust_reason: trustDraft.trustReason,
      conflicts_count: trustDraft.conflictsCount,
      parsed_payload: flattenParsedPayload(params.parsedResult),
    },
  });

  const resolvedSelectedShifts = await upsertParsedShifts({
    userId: params.userId,
    uploadId: upload.id,
    selectedEmployeeShifts: selectedShifts,
  });

  return { uploadId: upload.id, fileHash, resolvedSelectedShifts };
}

export async function detectSharedScheduleByHash(fileHash: string): Promise<{
  isShared: boolean;
  matchingCount: number;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { isShared: false, matchingCount: 0 };
  }

  const { data, error } = await supabase.rpc("detect_shared_schedule_by_hash", {
    p_file_hash: fileHash,
  });

  if (error || !data) {
    return { isShared: false, matchingCount: 0 };
  }

  return {
    isShared: Boolean(data.is_shared),
    matchingCount: Number(data.matching_count || 0),
  };
}
