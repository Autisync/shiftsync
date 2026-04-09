import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import * as crypto from "https://deno.land/std@0.208.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ParsedInputShift {
  employee_id?: string;
  employee_name?: string;
  date: string;
  starts_at: string;
  ends_at: string;
  role?: string;
  location?: string;
}

interface ParseExcelRequest {
  file_base64?: string;
  parsed_shifts?: ParsedInputShift[];
  employee_mapping?: Record<string, string>;
  uploader_user_id: string;
  consent_to_share: boolean;
}

interface ShiftToInsert {
  user_id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  role?: string;
  location?: string;
  source_upload_id?: string;
}

interface ParseResponse {
  success: boolean;
  created: number;
  duplicates: number;
  errors: Array<{ row: number; reason: string }>;
  upload_id?: string;
  message?: string;
}

function normalizeEmployeeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function excelSerialToDate(serial: number): Date {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === "number") {
    const d = excelSerialToDate(value);
    if (!isNaN(d.getTime())) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dmY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmY) {
      const day = Number(dmY[1]);
      const month = Number(dmY[2]);
      const year = Number(dmY[3]);
      return new Date(Date.UTC(year, month - 1, day));
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    }
  }

  return null;
}

function parseTimeValue(value: unknown): { hours: number; minutes: number } | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return { hours: value.getUTCHours(), minutes: value.getUTCMinutes() };
  }

  if (typeof value === "number") {
    const fraction = value >= 1 ? value % 1 : value;
    const totalMinutes = Math.round(fraction * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return { hours, minutes };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const iso = new Date(trimmed);
    if (!isNaN(iso.getTime()) && trimmed.includes("T")) {
      return { hours: iso.getUTCHours(), minutes: iso.getUTCMinutes() };
    }

    const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmm) {
      return { hours: Number(hhmm[1]) % 24, minutes: Number(hhmm[2]) % 60 };
    }
  }

  return null;
}

function combineDateAndTime(date: Date, time: { hours: number; minutes: number }): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time.hours,
    time.minutes,
    0,
    0,
  ));
}

function pickValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map<string, unknown>();
  Object.keys(row).forEach((k) => normalized.set(normalizeHeader(k), row[k]));

  for (const alias of aliases) {
    if (normalized.has(alias)) {
      return normalized.get(alias);
    }
  }

  return undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

async function hashFile(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseExcelContent(fileData: ArrayBuffer): Promise<{
  parsedShifts: ParsedInputShift[];
  errors: Array<{ row: number; reason: string }>;
}> {
  const errors: Array<{ row: number; reason: string }> = [];
  const parsedShifts: ParsedInputShift[] = [];

  try {
    const workbook = XLSX.read(new Uint8Array(fileData), {
      type: "array",
      cellDates: true,
      raw: true,
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { parsedShifts, errors: [{ row: 0, reason: "Excel file has no sheets" }] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });

    if (rows.length === 0) {
      return { parsedShifts, errors: [{ row: 0, reason: "Excel sheet is empty" }] };
    }

    const employeeCodeAliases = [
      "employee_code",
      "employee_id",
      "employee",
      "code",
      "staff_code",
      "staff_id",
    ];
    const employeeNameAliases = ["employee_name", "name", "full_name", "staff_name"];
    const dateAliases = ["date", "shift_date", "day", "work_date"];
    const startAliases = ["starts_at", "start_time", "start", "begin", "from"];
    const endAliases = ["ends_at", "end_time", "end", "finish", "to"];
    const roleAliases = ["role", "shift_type", "function", "job_role"];
    const locationAliases = ["location", "site", "workplace", "local"];

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;

      const employeeId = asNonEmptyString(pickValue(row, employeeCodeAliases));
      const employeeName = asNonEmptyString(pickValue(row, employeeNameAliases));
      const dateRaw = pickValue(row, dateAliases);
      const startRaw = pickValue(row, startAliases);
      const endRaw = pickValue(row, endAliases);
      const role = asNonEmptyString(pickValue(row, roleAliases));
      const location = asNonEmptyString(pickValue(row, locationAliases));

      if (!employeeId && !employeeName) {
        errors.push({ row: rowNumber, reason: "Missing employee_code/employee_name" });
        return;
      }

      const dateValue = parseDateValue(dateRaw);
      const startTime = parseTimeValue(startRaw);
      const endTime = parseTimeValue(endRaw);

      if (!dateValue || !startTime || !endTime) {
        errors.push({ row: rowNumber, reason: "Invalid date/start/end fields" });
        return;
      }

      const startsAt = combineDateAndTime(dateValue, startTime);
      let endsAt = combineDateAndTime(dateValue, endTime);

      if (endsAt <= startsAt) {
        // Overnight shift fallback
        endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
      }

      parsedShifts.push({
        employee_id: employeeId,
        employee_name: employeeName,
        date: startsAt.toISOString().slice(0, 10),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        role,
        location,
      });
    });

    return { parsedShifts, errors };
  } catch (error) {
    return {
      parsedShifts,
      errors: [{ row: 0, reason: `Failed to parse Excel: ${error.message}` }],
    };
  }
}

async function deduplicateShifts(
  shifts: ShiftToInsert[],
): Promise<{ newShifts: ShiftToInsert[]; duplicateCount: number }> {
  const newShifts: ShiftToInsert[] = [];
  let duplicateCount = 0;

  for (const shift of shifts) {
    const { error } = await supabase
      .from("shifts")
      .select("id")
      .eq("user_id", shift.user_id)
      .eq("starts_at", shift.starts_at)
      .eq("ends_at", shift.ends_at)
      .single();

    if (error && error.code === "PGRST116") {
      newShifts.push(shift);
    } else if (!error) {
      duplicateCount++;
    } else {
      console.error("Dedup check failed:", error);
    }
  }

  return { newShifts, duplicateCount };
}

async function mapEmployeesToUsers(
  employeeList: string[],
  employeeMapping?: Record<string, string>,
): Promise<Record<string, string>> {
  const mapping: Record<string, string> = employeeMapping || {};
  const missingEmployees = employeeList.filter((emp) => !mapping[emp]);

  if (missingEmployees.length === 0) {
    return mapping;
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, employee_code, full_name");

  if (error || !users) {
    return mapping;
  }

  for (const emp of missingEmployees) {
    const normalized = normalizeEmployeeName(emp);

    let match = users.find((u) => normalizeEmployeeName(u.employee_code || "") === normalized);
    if (!match) {
      match = users.find((u) => normalizeEmployeeName(u.full_name || "") === normalized);
    }

    if (match) {
      mapping[emp] = match.id;
    }
  }

  return mapping;
}

async function validateConstraints(
  shift: ShiftToInsert,
): Promise<{ valid: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("validate_shift_constraints", {
    p_user_id: shift.user_id,
    p_starts_at: shift.starts_at,
    p_ends_at: shift.ends_at,
  });

  if (error) {
    // If DB function is unavailable, do not block upload; this is logged for observability.
    console.error("Constraint validation RPC error:", error.message);
    return { valid: true };
  }

  if (data && typeof data === "object" && data.valid === false) {
    return { valid: false, reason: String(data.constraint || "constraint_violation") };
  }

  return { valid: true };
}

async function insertShifts(
  shifts: ShiftToInsert[],
  uploadId: string,
): Promise<number> {
  if (shifts.length === 0) return 0;

  const shiftsWithUploadId = shifts.map((s) => ({
    ...s,
    source_upload_id: uploadId,
  }));

  const { data, error } = await supabase
    .from("shifts")
    .insert(shiftsWithUploadId)
    .select("id");

  if (error) {
    throw error;
  }

  return data?.length || 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: ParseExcelRequest = await req.json();

    if (!body.uploader_user_id) {
      return new Response(JSON.stringify({ error: "Missing required field: uploader_user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let parsedShifts: ParsedInputShift[] = body.parsed_shifts || [];
    const errors: Array<{ row: number; reason: string }> = [];
    let fileHash = "";

    if (body.file_base64) {
      const fileData = Uint8Array.from(atob(body.file_base64), (c) => c.charCodeAt(0));
      fileHash = await hashFile(fileData.buffer);

      if (parsedShifts.length === 0) {
        const parsed = await parseExcelContent(fileData.buffer);
        parsedShifts = parsed.parsedShifts;
        errors.push(...parsed.errors);
      }
    }

    if (!fileHash) {
      const encoder = new TextEncoder();
      const data = encoder.encode(
        JSON.stringify(parsedShifts.sort((a, b) => a.starts_at.localeCompare(b.starts_at))),
      );
      fileHash = await hashFile(data.buffer);
    }

    if (parsedShifts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          created: 0,
          duplicates: 0,
          errors: errors.length ? errors : [{ row: 0, reason: "No valid shifts parsed" }],
          message: "Failed to parse any shift entries",
        } as ParseResponse),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const employeeRefs = Array.from(
      new Set(parsedShifts.map((s) => s.employee_id || s.employee_name).filter(Boolean) as string[]),
    );

    const userMapping = await mapEmployeesToUsers(employeeRefs, body.employee_mapping);

    const mappedShifts: ShiftToInsert[] = [];
    const payloadForRecovery: ParsedInputShift[] = [];

    for (const s of parsedShifts) {
      const employeeRef = s.employee_id || s.employee_name;
      if (!employeeRef) continue;

      payloadForRecovery.push(s);
      const userId = userMapping[employeeRef];

      if (!userId) {
        continue;
      }

      mappedShifts.push({
        user_id: userId,
        date: s.date,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        role: s.role,
        location: s.location,
      });
    }

    if (mappedShifts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          created: 0,
          duplicates: 0,
          errors: [
            ...errors,
            { row: 0, reason: "Could not map any employees to existing users" },
          ],
          message: "No shifts could be mapped to users",
        } as ParseResponse),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const validForInsert: ShiftToInsert[] = [];
    for (const shift of mappedShifts) {
      const validation = await validateConstraints(shift);
      if (!validation.valid) {
        errors.push({
          row: 0,
          reason: `Constraint rejected shift (${shift.user_id} ${shift.starts_at}): ${validation.reason}`,
        });
        continue;
      }
      validForInsert.push(shift);
    }

    const { newShifts, duplicateCount } = await deduplicateShifts(validForInsert);

    const { data: uploadData, error: uploadError } = await supabase
      .from("schedule_uploads")
      .insert({
        uploader_user_id: body.uploader_user_id,
        file_hash: fileHash,
        consent_to_share: body.consent_to_share,
        metadata: {
          parsed_shifts_total: parsedShifts.length,
          mapped_shifts_total: mappedShifts.length,
          duplicate_candidates: duplicateCount,
          mapped_employees: employeeRefs.filter((n) => userMapping[n]).length,
          unmapped_employees: employeeRefs.filter((n) => !userMapping[n]).length,
          parsed_payload: payloadForRecovery,
        },
      })
      .select("id")
      .single();

    if (uploadError || !uploadData?.id) {
      return new Response(
        JSON.stringify({
          success: false,
          created: 0,
          duplicates: duplicateCount,
          errors,
          message: "Failed to record schedule upload",
        } as ParseResponse),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const insertedCount = await insertShifts(newShifts, uploadData.id);

    return new Response(
      JSON.stringify({
        success: true,
        created: insertedCount,
        duplicates: duplicateCount,
        errors,
        upload_id: uploadData.id,
        message:
          `Upload processed. Created=${insertedCount}, duplicates=${duplicateCount}, ` +
          `mapped=${mappedShifts.length}, parsed=${parsedShifts.length}`,
      } as ParseResponse),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        created: 0,
        duplicates: 0,
        errors: [{ row: 0, reason: error.message }],
        message: "Internal server error",
      } as ParseResponse),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
