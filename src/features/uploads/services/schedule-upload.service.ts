import { getBackend } from "@/services/backend/backend-provider";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { ShiftData, ParsedScheduleResult } from "@/types/shift";

export interface UploadPersistenceResult {
  uploadId: string;
  fileHash: string;
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
      selected_shift_count: params.selectedEmployeeShifts?.length ?? 0,
      parsed_payload: flattenParsedPayload(params.parsedResult),
    },
  });

  return { uploadId: upload.id, fileHash };
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
