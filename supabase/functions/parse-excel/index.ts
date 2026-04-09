import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { readXlsx } from "https://deno.land/x/xlsx@0.0.4/mod.ts";
import * as crypto from "https://deno.land/std@0.208.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ParseExcelRequest {
  file_base64?: string; // Optional if parsed_shifts provided
  parsed_shifts?: Array<{
    employee_id?: string;
    employee_name?: string;
    date: string;
    starts_at: string;
    ends_at: string;
    role?: string;
    location?: string;
  }>;
  employee_mapping?: Record<string, string>; // Map employee name/code to user id
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

// Normalize employee name for matching
function normalizeEmployeeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

// Calculate SHA256 hash of file content
async function hashFile(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// Parse Excel and extract shifts
async function parseExcelContent(
  fileData: ArrayBuffer,
  employeeMapping: Record<string, string>
): Promise<{ shifts: ShiftToInsert[]; errors: Array<{ row: number; reason: string }> }> {
  const shifts: ShiftToInsert[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  try {
    // Use XLSX library via Deno
    // For now, we'll use a basic parsing approach since xlsx library availability may vary
    // In production, integrate with the existing excel-parser.ts logic
    const decoder = new TextDecoder();
    const text = decoder.decode(fileData);

    // This is a placeholder - in production, use proper XLSX parsing
    // The frontend already has working parsing logic that can be reused
    if (!text.includes("xlsx")) {
      errors.push({ row: 0, reason: "File does not appear to be valid Excel format" });
      return { shifts, errors };
    }

    // For MVP: delegate to client-side parser for now
    // Production: implement server-side XLSX parsing or call edge function from client
    return { shifts, errors };
  } catch (error) {
    errors.push({ row: 0, reason: `Parse error: ${error.message}` });
    return { shifts, errors };
  }
}

// Deduplicate shifts - check for existing shifts
async function deduplicateShifts(
  shifts: ShiftToInsert[]
): Promise<{ newShifts: ShiftToInsert[]; duplicateCount: number }> {
  const newShifts: ShiftToInsert[] = [];
  let duplicateCount = 0;

  for (const shift of shifts) {
    const { data, error } = await supabase
      .from("shifts")
      .select("id")
      .eq("user_id", shift.user_id)
      .eq("starts_at", shift.starts_at)
      .eq("ends_at", shift.ends_at)
      .single();

    if (error && error.code === "PGRST116") {
      // Not found - this is new
      newShifts.push(shift);
    } else if (!error) {
      // Exists - duplicate
      duplicateCount++;
    } else if (error.code !== "PGRST116") {
      // Real error
      console.error("Dedup check failed:", error);
    }
  }

  return { newShifts, duplicateCount };
}

// Map employees to user IDs
async function mapEmployeesToUsers(
  employeeList: string[],
  employeeMapping?: Record<string, string>
): Promise<Record<string, string>> {
  const mapping: Record<string, string> = employeeMapping || {};

  // Fill missing mappings by querying database
  const missingEmployees = employeeList.filter((emp) => !mapping[emp]);

  if (missingEmployees.length > 0) {
    const { data: users, error } = await supabase.from("users").select("id, employee_code, full_name");

    if (!error && users) {
      for (const emp of missingEmployees) {
        const normalized = normalizeEmployeeName(emp);

        // Try exact employee_code match first
        let match = users.find((u) => u.employee_code?.toLowerCase() === normalized);

        // Try normalized full_name match
        if (!match) {
          match = users.find((u) => normalizeEmployeeName(u.full_name || "") === normalized);
        }

        if (match) {
          mapping[emp] = match.id;
        }
      }
    }
  }

  return mapping;
}

// Insert shifts in batch
async function insertShifts(shifts: ShiftToInsert[], uploadId: string): Promise<number> {
  if (shifts.length === 0) return 0;

  const shiftsWithUploadId = shifts.map((s) => ({
    ...s,
    source_upload_id: uploadId,
  }));

  const { data, error } = await supabase.from("shifts").insert(shiftsWithUploadId).select();

  if (error) {
    console.error("Insert error:", error);
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
      return new Response(
        JSON.stringify({ error: "Missing required field: uploader_user_id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!body.parsed_shifts || body.parsed_shifts.length === 0) {
      if (!body.file_base64) {
        return new Response(
          JSON.stringify({
            error: "Either parsed_shifts or file_base64 must be provided",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Fallback to file parsing (future implementation)
      return new Response(
        JSON.stringify({
          success: false,
          created: 0,
          duplicates: 0,
          errors: [{ row: 0, reason: "File-based parsing not yet implemented" }],
          message: "Please use pre-parsed shifts (parsed_shifts parameter)",
        } as ParseResponse),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Calculate file hash from parsed data for deduplication
    const shiftDataStr = JSON.stringify(body.parsed_shifts.sort((a, b) => 
      a.starts_at.localeCompare(b.starts_at)
    ));
    const encoder = new TextEncoder();
    const fileData = encoder.encode(shiftDataStr);
    const fileHash = await hashFile(fileData);

    // Map employees to users
    const employeeNames = Array.from(
      new Set(
        body.parsed_shifts
          .map((s) => s.employee_name || s.employee_id)
          .filter(Boolean)
      )
    );
    const userMapping = await mapEmployeesToUsers(employeeNames, body.employee_mapping);

    // Convert parsed shifts to insertable format
    const mappedShifts: ShiftToInsert[] = body.parsed_shifts
      .map((s) => {
        const empName = s.employee_name || s.employee_id;
        const userId = empName ? userMapping[empName] : undefined;

        if (!userId) {
          return null;
        }

        return {
          user_id: userId,
          date: s.date,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          role: s.role,
          location: s.location,
        };
      })
      .filter(Boolean) as ShiftToInsert[];

    if (mappedShifts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          created: 0,
          duplicates: 0,
          errors: [
            {
              row: 0,
              reason: "Could not map any employees to users in the system",
            },
          ],
          message: "No shifts could be mapped to users",
        } as ParseResponse),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Deduplicate
    const { newShifts, duplicateCount } = await deduplicateShifts(mappedShifts);

    // Record upload
    const { data: uploadData, error: uploadError } = await supabase
      .from("schedule_uploads")
      .insert({
        uploader_user_id: body.uploader_user_id,
        file_hash: fileHash,
        consent_to_share: body.consent_to_share,
        metadata: {
          parsed_shifts: mappedShifts.length,
          duplicates: duplicateCount,
          mapped_employees: employeeNames.filter((n) => userMapping[n]).length,
          unmapped_employees: employeeNames.filter((n) => !userMapping[n]).length,
        },
      })
      .select();

    if (uploadError || !uploadData?.[0]) {
      return new Response(
        JSON.stringify({
          success: false,
          created: 0,
          duplicates: duplicateCount,
          errors: [],
          message: "Failed to record upload",
        } as ParseResponse),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const uploadId = uploadData[0].id;

    // Insert new shifts
    const insertedCount = await insertShifts(newShifts, uploadId);

    return new Response(
      JSON.stringify({
        success: true,
        created: insertedCount,
        duplicates: duplicateCount,
        errors: [],
        upload_id: uploadId,
        message: `Successfully parsed: ${insertedCount} shifts created, ${duplicateCount} duplicates skipped, ${employeeNames.length - mappedShifts.length} employees unmapped`,
      } as ParseResponse),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Function error:", error);
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
      }
    );
  }
});
