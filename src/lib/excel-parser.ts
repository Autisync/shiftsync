import {
  ShiftData,
  EmployeeSchedule,
  ParsedScheduleResult,
} from "@/types/shift";
import { getErrorMessage } from "@/lib/getErrorMessage";

// Dynamic import for xlsx to avoid build issues
let XLSX: any = null;

async function loadXLSX() {
  if (!XLSX) {
    // @ts-ignore - Dynamic import
    XLSX = await import("xlsx");
  }
  return XLSX;
}

/**
 * Convert Excel time value to HH:MM string
 */
function excelTimeToString(value: any): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // If it's a string like "OFF", return null
  if (typeof value === "string") {
    const trimmed = value.trim().toUpperCase();
    if (
      trimmed === "OFF" ||
      trimmed === "FOLGA" ||
      trimmed === "-" ||
      trimmed === ""
    ) {
      return null;
    }
    // Try to parse string time formats like "11:00", "1100", "11"
    const timeMatch = trimmed.match(/^(\d{1,2}):?(\d{2})?$/);
    if (timeMatch) {
      const hours = timeMatch[1].padStart(2, "0");
      const minutes = timeMatch[2] || "00";
      return `${hours}:${minutes}`;
    }
    return trimmed;
  }

  // If it's a number, treat as Excel time fraction (0-1 representing 24 hours)
  if (typeof value === "number") {
    // Excel stores time as a fraction of 24 hours
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  // If it's a Date object
  if (value instanceof Date) {
    const hours = value.getHours();
    const minutes = value.getMinutes();
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  return null;
}

/**
 * Convert Excel date to JavaScript Date (raw, may have wrong year)
 */
function excelDateToDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    // Excel date serial number - convert to JS date
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    return new Date(excelEpoch.getTime() + value * msPerDay);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

/**
 * Normalize a schedule date to the correct year.
 * Handles Excel serial numbers, Date objects, and string dates.
 * Returns ISO date string "YYYY-MM-DD" or null if invalid.
 */
function normalizeScheduleDate(
  raw: unknown,
  baseYear: number,
  hasDecember: boolean,
  hasJanuary: boolean,
): string | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  let day: number | null = null;
  let month: number | null = null;

  // Handle Date objects
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const year = raw.getFullYear();
    day = raw.getDate();
    month = raw.getMonth() + 1; // 0-indexed

    // If year is reasonable (>= 2015), keep it as-is
    if (year >= 2015) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Handle Excel serial numbers
  if (typeof raw === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    const parsed = new Date(excelEpoch.getTime() + raw * msPerDay);

    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      day = parsed.getDate();
      month = parsed.getMonth() + 1;

      // If year is reasonable, keep it
      if (year >= 2015) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  // Handle string dates like "03/02", "03/02/2001", "2001-02-03", etc.
  if (typeof raw === "string") {
    const trimmed = raw.trim();

    // Try DD/MM/YYYY or DD/MM format
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (slashMatch) {
      day = parseInt(slashMatch[1], 10);
      month = parseInt(slashMatch[2], 10);
      const yearPart = slashMatch[3] ? parseInt(slashMatch[3], 10) : null;

      // If year is reasonable, use it
      if (yearPart !== null) {
        const fullYear = yearPart < 100 ? 2000 + yearPart : yearPart;
        if (fullYear >= 2015) {
          return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }

    // Try parsing as ISO date or other standard format
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      day = parsed.getDate();
      month = parsed.getMonth() + 1;

      if (year >= 2015) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  // If we couldn't extract day/month, return null
  if (day === null || month === null) {
    return null;
  }

  // Apply year logic based on Dec/Jan rollover
  let finalYear = baseYear;
  if (hasDecember && hasJanuary && month === 1) {
    finalYear = baseYear + 1;
  }

  return `${finalYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Extract month from a raw date value (for pre-scanning)
 */
function extractMonthFromRaw(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.getMonth() + 1;
  }

  if (typeof raw === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    const parsed = new Date(excelEpoch.getTime() + raw * msPerDay);
    if (!isNaN(parsed.getTime())) {
      return parsed.getMonth() + 1;
    }
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();

    // Try DD/MM/YYYY or DD/MM format
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (slashMatch) {
      return parseInt(slashMatch[2], 10);
    }

    // Try parsing as standard date
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.getMonth() + 1;
    }
  }

  return null;
}

/**
 * Convert time string "HH:MM" to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  return hours * 60 + minutes;
}

/**
 * Determine shift type based on end time
 * - If endTime <= 17:00 -> 'morning'
 * - Else if endTime <= 18:00 -> 'afternoon'
 * - Else endTime > 18:00 -> 'night' (displayed as Late)
 * - If shift crosses midnight (end < start), classify as 'night'
 */
function determineShiftType(
  startTime: string,
  endTime: string,
): ShiftData["shiftType"] {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  // If end time is less than start time, shift crosses midnight -> night
  if (endMinutes < startMinutes) {
    return "night";
  }

  // Classify based on end time thresholds
  if (endMinutes <= 17 * 60) {
    return "morning";
  } else if (endMinutes <= 18 * 60) {
    return "afternoon";
  } else {
    return "night";
  }
}

/**
 * Detect if the sheet is in Concentrix wide format
 */
function isConcentrixWideFormat(jsonData: any[][]): {
  isMatch: boolean;
  headerRowIndex: number;
} {
  for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
    const row = jsonData[i];
    if (!row) continue;

    const rowStr = row
      .map((cell) => String(cell || "").toLowerCase())
      .join("|");

    // Look for header row with IEX ID and Shift Type
    if (
      rowStr.includes("iex id") ||
      rowStr.includes("iex") ||
      (rowStr.includes("name") && rowStr.includes("shift type"))
    ) {
      // Verify it has Start/End columns
      const hasStartEnd = row.some(
        (cell) => String(cell || "").toLowerCase() === "start",
      );
      if (hasStartEnd) {
        return { isMatch: true, headerRowIndex: i };
      }
    }
  }

  return { isMatch: false, headerRowIndex: -1 };
}

/**
 * Parse Concentrix wide schedule format
 */
function parseConcentrixWideSchedule(
  jsonData: any[][],
  headerRowIndex: number,
): EmployeeSchedule[] {
  const employees: EmployeeSchedule[] = [];
  const headerRow = jsonData[headerRowIndex];
  const dateRow = jsonData[headerRowIndex - 2] || [];

  // Find column indices
  const colIndices: { [key: string]: number } = {};
  const startEndPairs: { startCol: number; endCol: number; dateCol: number }[] =
    [];

  headerRow.forEach((cell, idx) => {
    const cellStr = String(cell || "")
      .toLowerCase()
      .trim();

    if (cellStr === "iex id") colIndices.iexId = idx;
    if (cellStr === "workday id") colIndices.workdayId = idx;
    if (cellStr === "dsid") colIndices.dsid = idx;
    if (cellStr === "company") colIndices.company = idx;
    if (cellStr === "name") colIndices.name = idx;
    if (cellStr === "lob") colIndices.lob = idx;
    if (
      cellStr === "wah / on-site" ||
      cellStr === "wah/on-site" ||
      cellStr === "location"
    ) {
      colIndices.location = idx;
    }
    if (cellStr === "shift type") colIndices.shiftType = idx;
  });

  // Find Start/End column pairs after Shift Type column
  const shiftTypeCol = colIndices.shiftType || 7;
  let currentStart = -1;

  for (let i = shiftTypeCol + 1; i < headerRow.length; i++) {
    const cellStr = String(headerRow[i] || "")
      .toLowerCase()
      .trim();

    if (cellStr === "start") {
      currentStart = i;
    } else if (cellStr === "end" && currentStart !== -1) {
      startEndPairs.push({
        startCol: currentStart,
        endCol: i,
        dateCol: currentStart, // Date is in the same column as Start in dateRow
      });
      currentStart = -1;
    }
  }

  // Pre-scan to detect which months are present (for Dec/Jan rollover)
  const monthsPresent = new Set<number>();
  for (const pair of startEndPairs) {
    const dateVal = dateRow[pair.dateCol] || dateRow[pair.startCol];
    const month = extractMonthFromRaw(dateVal);
    if (month !== null) {
      monthsPresent.add(month);
    }
  }
  const hasDecember = monthsPresent.has(12);
  const hasJanuary = monthsPresent.has(1);
  const baseYear = new Date().getFullYear();

  // Parse each employee row (rows after header)
  for (let rowIdx = headerRowIndex + 1; rowIdx < jsonData.length; rowIdx++) {
    const row = jsonData[rowIdx];
    if (!row || row.length === 0) continue;

    // Get employee info
    const employeeName = String(row[colIndices.name] || "").trim();
    if (!employeeName || employeeName.toLowerCase() === "name") continue;

    const employeeId = String(
      row[colIndices.iexId] || row[colIndices.workdayId] || `emp-${rowIdx}`,
    ).trim();
    const company = String(row[colIndices.company] || "").trim();
    const lob = String(row[colIndices.lob] || "").trim();
    const location = String(row[colIndices.location] || "").trim();
    const shiftTypeStr = String(row[colIndices.shiftType] || "").trim();

    const shifts: ShiftData[] = [];

    // Parse each Start/End pair
    startEndPairs.forEach((pair, pairIdx) => {
      const startVal = row[pair.startCol];
      const endVal = row[pair.endCol];

      // Get date from dateRow - use normalized date with proper year
      const dateVal = dateRow[pair.dateCol] || dateRow[pair.startCol];
      const isoDate = normalizeScheduleDate(
        dateVal,
        baseYear,
        hasDecember,
        hasJanuary,
      );

      if (!isoDate) return;

      // Convert ISO date to Date object for ShiftData
      const date = new Date(isoDate + "T00:00:00");

      // Check if this is an OFF day
      const startStr = String(startVal || "")
        .trim()
        .toUpperCase();
      if (
        startStr === "OFF" ||
        startStr === "FOLGA" ||
        startStr === "-" ||
        startStr === ""
      ) {
        // Skip OFF days - don't create a shift
        return;
      }

      const startTime = excelTimeToString(startVal);
      const endTime = excelTimeToString(endVal);

      if (!startTime || !endTime) return;

      const shiftType = determineShiftType(startTime, endTime);

      shifts.push({
        id: `shift-${rowIdx}-${pairIdx}-${Date.now()}`,
        week: Math.ceil((pairIdx + 1) / 7),
        date,
        startTime,
        endTime,
        shiftType,
        status: "active",
        employeeName,
        lob,
        location,
        notes: shiftTypeStr,
      });
    });

    // Sort shifts by date then by startTime
    shifts.sort((a, b) => {
      const dateA = a.date.getTime();
      const dateB = b.date.getTime();
      if (dateA !== dateB) return dateA - dateB;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    if (shifts.length > 0 || employeeName) {
      employees.push({
        employeeId,
        employeeName,
        company,
        lob,
        shiftType: shiftTypeStr,
        location,
        shifts,
      });
    }
  }

  return employees;
}

/**
 * Parse simple schedule format (original format)
 */
function parseSimpleSchedule(jsonData: any[][]): ShiftData[] {
  const shifts: ShiftData[] = [];
  const baseYear = new Date().getFullYear();

  // Pre-scan to detect which months are present (for Dec/Jan rollover)
  const monthsPresent = new Set<number>();
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as any[];
    if (row.length < 4) continue;
    const month = extractMonthFromRaw(row[1]);
    if (month !== null) {
      monthsPresent.add(month);
    }
  }
  const hasDecember = monthsPresent.has(12);
  const hasJanuary = monthsPresent.has(1);

  // Skip header row and parse data
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as any[];
    if (row.length < 4) continue;

    const week = parseInt(row[0]) || 0;
    const dateStr = row[1];
    const timeStr = row[2];
    const typeStr = String(row[3] || "").toLowerCase();

    // Parse date with proper year handling
    const isoDate = normalizeScheduleDate(
      dateStr,
      baseYear,
      hasDecember,
      hasJanuary,
    );
    if (!isoDate) continue;

    const date = new Date(isoDate + "T00:00:00");

    // Parse time range
    const [startTime, endTime] = String(timeStr || "")
      .split("-")
      .map((t: string) => t.trim());

    // Determine shift type
    let shiftType: ShiftData["shiftType"] = "other";
    if (
      typeStr.includes("manha") ||
      typeStr.includes("morning") ||
      typeStr.includes("m")
    ) {
      shiftType = "morning";
    } else if (
      typeStr.includes("tarde") ||
      typeStr.includes("afternoon") ||
      typeStr.includes("a")
    ) {
      shiftType = "afternoon";
    } else if (
      typeStr.includes("noite") ||
      typeStr.includes("night") ||
      typeStr.includes("n")
    ) {
      shiftType = "night";
    } else if (
      typeStr.includes("folga") ||
      typeStr.includes("off") ||
      typeStr.includes("f")
    ) {
      shiftType = "off";
    }

    shifts.push({
      id: `shift-${i}-${Date.now()}`,
      week,
      date,
      startTime: startTime || "00:00",
      endTime: endTime || "00:00",
      shiftType,
      status: "active",
      notes: row[4]?.toString() || undefined,
    });
  }

  // Sort shifts by date then by startTime
  shifts.sort((a, b) => {
    const dateA = a.date.getTime();
    const dateB = b.date.getTime();
    if (dateA !== dateB) return dateA - dateB;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  return shifts;
}

// ─────────────────────────────────────────────────────────────────────────────
// VODAFONE / RANDSTAD AIRPORT FORMAT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shift-code → { startTime, endTime } lookup.
 * Derived from the LEGENDA section present in every sheet (rows ~41-55).
 * Non-work codes (FC, FO, FD, Fe, Au, F, Li, Bx, AR) map to null → day skipped.
 */
const VODAFONE_SHIFT_MAP: Record<
  string,
  { startTime: string; endTime: string } | null
> = {
  // Work shifts
  M1: { startTime: "09:00", endTime: "18:00" },
  I2: { startTime: "09:30", endTime: "18:30" },
  I3: { startTime: "10:00", endTime: "19:00" },
  I4: { startTime: "11:00", endTime: "20:00" },
  I5: { startTime: "11:30", endTime: "20:30" },
  I7: { startTime: "12:30", endTime: "21:30" },
  T9: { startTime: "13:30", endTime: "22:30" },
  T11: { startTime: "14:30", endTime: "23:30" },
  M13: { startTime: "06:00", endTime: "15:00" },
  M15: { startTime: "07:00", endTime: "16:00" },
  M16: { startTime: "08:00", endTime: "17:00" },
  M22: { startTime: "10:00", endTime: "16:30" },
  M17: { startTime: "09:00", endTime: "14:30" },
  M25: { startTime: "10:30", endTime: "16:00" },

  // Non-work / absence codes → null (day will be skipped)
  FC: null, // Folga Complementar
  FO: null, // Folga Obrigatória
  FD: null, // Feriado
  Fe: null, // Férias
  Au: null, // Ausência
  F: null, // Formação
  Li: null, // Licença
  Bx: null, // Baixa
  AR: null, // (archive / inactive employee)
};

/**
 * Extract the month number from a sheet name like "Janeiro26", "Fevereiro26", etc.
 */
const PT_MONTH_NAMES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function monthFromSheetName(sheetName: string): number | null {
  const lower = sheetName.toLowerCase().replace(/\d/g, "").trim();
  return PT_MONTH_NAMES[lower] ?? null;
}

/**
 * Detect if an entire workbook is a Vodafone/Randstad Airport schedule.
 * Heuristic: sheet names are Portuguese month names and row 1 contains
 * "Horário do Mês" together with "VODAFONE" or "RANDSTAD".
 */
function isVodafoneAirportFormat(workbook: any): boolean {
  const sheetNames: string[] = workbook.SheetNames;

  // At least 2 sheets whose names match a Portuguese month
  const monthSheets = sheetNames.filter((n) => monthFromSheetName(n) !== null);
  if (monthSheets.length < 2) return false;

  // Check the first month sheet for telltale header content
  const ws = workbook.Sheets[monthSheets[0]];
  if (!ws) return false;

  const XLSX_local = workbook._XLSX ?? globalThis._XLSX_MODULE;
  // Fallback: use raw cell access
  const cell_A2 = ws["B2"]?.v ?? "";
  const cell_B1 = ws["A2"]?.v ?? "";
  const cell_title = ws["A2"]?.v ?? ws["B2"]?.v ?? "";

  // Look for RANDSTAD or VODAFONE in the first few cells
  const sentinel = String(cell_A2) + String(cell_B1) + String(cell_title);
  return /randstad/i.test(sentinel) || /vodafone/i.test(sentinel);
}

/**
 * Alternative detector using sheet_to_json output (called after we already
 * have jsonData for the first sheet).
 */
function isVodafoneAirportFormatFromJson(jsonData: any[][]): boolean {
  // Row index 2 (0-based) contains EMPRESA / RANDSTAD
  // Row index 6 contains Cliente / VODAFONE
  for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
    const row = jsonData[r];
    if (!row) continue;
    const combined = row.map((c) => String(c ?? "")).join(" ");
    if (/randstad/i.test(combined) || /vodafone/i.test(combined)) {
      // Also confirm we see a "Nome" column (row 12) pattern
      for (let r2 = r; r2 < Math.min(jsonData.length, 15); r2++) {
        const row2 = jsonData[r2];
        if (!row2) continue;
        const r2str = row2.map((c: any) => String(c ?? "")).join(" ");
        if (/\bNome\b/i.test(r2str)) return true;
      }
    }
  }
  return false;
}

/**
 * Parse a single Vodafone/Randstad airport sheet.
 *
 * Layout (0-based row indices, 0-based column indices):
 *  Row 1  : Title  "Loja Aeroporto de Lisboa_ Horário do Mês de <Month> <Year>"
 *  Row 2  : EMPRESA  | RANDSTAD II ...
 *  Row 6  : Cliente  | VODAFONE ...
 *  Row 7  : LOCAL DE TRABALHO | <location>
 *  Row 11 : Month name | day-of-week labels (5ºF, 6ºF, SB, DM, 2ºF …)
 *  Row 12 : "Nome"    | day numbers (1, 2, 3 … up to 28/29/30/31)
 *  Row 13…: Employee name | shift code per day (cols 1–31)
 *  Row 30+: Headcount / footer rows (stop reading employees here)
 */
function parseVodafoneSheet(
  jsonData: any[][],
  sheetName: string,
): EmployeeSchedule[] {
  const employees: EmployeeSchedule[] = [];

  // ── Determine month & year from sheet name ──────────────────────────────
  const month = monthFromSheetName(sheetName);
  if (month === null) return employees;

  // Try to extract year from title row (row index 1)
  let year = new Date().getFullYear();
  const titleRow = jsonData[1];
  if (titleRow) {
    const titleStr = titleRow.map((c: any) => String(c ?? "")).join(" ");
    const yearMatch = titleStr.match(/\b(20\d{2})\b/);
    if (yearMatch) year = parseInt(yearMatch[1], 10);
  }

  // ── Extract metadata ────────────────────────────────────────────────────
  const locationRow = jsonData[7];
  const location = locationRow
    ? String(locationRow[1] ?? "").trim()
    : "Aeroporto de Lisboa";

  const clientRow = jsonData[6];
  const client = clientRow ? String(clientRow[1] ?? "").trim() : "Vodafone";

  // ── Find the "Nome" header row (usually row 12) ─────────────────────────
  let nameRowIdx = -1;
  for (let r = 8; r < Math.min(jsonData.length, 18); r++) {
    const row = jsonData[r];
    if (!row) continue;
    if (
      String(row[0] ?? "")
        .trim()
        .toLowerCase() === "nome"
    ) {
      nameRowIdx = r;
      break;
    }
  }
  if (nameRowIdx === -1) return employees; // can't parse without header

  const dayRow = jsonData[nameRowIdx]; // row with day numbers (1..31) in cols 1..N

  // Build dayCol → Date map
  // dayRow[0] = "Nome", dayRow[1..N] = day numbers
  const dayColToDate: Map<number, Date> = new Map();
  for (let col = 1; col < dayRow.length; col++) {
    const rawDay = dayRow[col];
    if (rawDay === null || rawDay === undefined || String(rawDay).trim() === "")
      continue;
    const dayNum = parseInt(String(rawDay), 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) continue;
    try {
      const d = new Date(year, month - 1, dayNum);
      if (d.getMonth() === month - 1) {
        dayColToDate.set(col, d);
      }
    } catch {
      // invalid date – skip
    }
  }

  // ── Parse employee rows ─────────────────────────────────────────────────
  // Employee data starts at nameRowIdx + 1 and ends before footer rows
  // (footer rows start with "Headcount", "Total de Ausências", "LEGENDA", etc.)
  const FOOTER_KEYWORDS =
    /^(headcount|total de aus|legenda|folga|f[eé]rias|baixa)/i;

  for (let rowIdx = nameRowIdx + 1; rowIdx < jsonData.length; rowIdx++) {
    const row = jsonData[rowIdx];
    if (!row) continue;

    const rawName = String(row[0] ?? "").trim();
    if (!rawName) continue;
    if (FOOTER_KEYWORDS.test(rawName)) break; // reached footer section

    const employeeName = rawName;
    const employeeId = `vf-${sheetName}-${rowIdx}`;
    const shifts: ShiftData[] = [];

    dayColToDate.forEach((date, col) => {
      const rawCode = String(row[col] ?? "").trim();
      if (!rawCode) return;

      // Look up shift times
      const times = VODAFONE_SHIFT_MAP[rawCode];
      if (times === undefined) {
        // Unknown code – attempt to parse if it looks like a time range e.g. "09:00/18:00"
        const rangeMatch = rawCode.match(
          /^(\d{1,2})[h:](\d{2})[\s/\\-]+(\d{1,2})[h:](\d{2})$/i,
        );
        if (rangeMatch) {
          const startTime = `${rangeMatch[1].padStart(2, "0")}:${rangeMatch[2]}`;
          const endTime = `${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4]}`;
          shifts.push({
            id: `shift-vf-${rowIdx}-${col}-${Date.now()}`,
            week: Math.ceil(date.getDate() / 7),
            date,
            startTime,
            endTime,
            shiftType: determineShiftType(startTime, endTime),
            status: "active",
            employeeName,
            location,
            notes: `${client} | ${rawCode}`,
          });
        }
        // else: truly unknown code, skip
        return;
      }

      if (times === null) return; // non-work day (day-off, holiday, sick leave…)

      const { startTime, endTime } = times;
      shifts.push({
        id: `shift-vf-${rowIdx}-${col}-${Date.now()}`,
        week: Math.ceil(date.getDate() / 7),
        date,
        startTime,
        endTime,
        shiftType: determineShiftType(startTime, endTime),
        status: "active",
        employeeName,
        location,
        notes: `${client} | ${rawCode}`,
      });
    });

    // Sort by date then start time
    shifts.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return diff !== 0
        ? diff
        : timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    employees.push({
      employeeId,
      employeeName,
      company: "RANDSTAD II",
      lob: client,
      shiftType: "",
      location,
      shifts,
    });
  }

  return employees;
}

/**
 * Parse an entire Vodafone/Randstad airport workbook (all month sheets).
 * Employees that appear across multiple sheets are merged by name.
 */
function parseVodafoneAirportWorkbook(workbook: any): EmployeeSchedule[] {
  const xlsxLib = workbook._xlsxLib; // attached by caller
  const employeeMap = new Map<string, EmployeeSchedule>();

  for (const sheetName of workbook.SheetNames) {
    if (monthFromSheetName(sheetName) === null) continue;

    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const jsonData: any[][] = xlsxLib.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: null,
    });

    const sheetEmployees = parseVodafoneSheet(jsonData, sheetName);

    for (const emp of sheetEmployees) {
      const key = emp.employeeName.toUpperCase();
      if (!employeeMap.has(key)) {
        employeeMap.set(key, { ...emp });
      } else {
        // Merge shifts from this sheet into the existing employee entry
        const existing = employeeMap.get(key)!;
        existing.shifts = [...existing.shifts, ...emp.shifts].sort((a, b) => {
          const diff = a.date.getTime() - b.date.getTime();
          return diff !== 0
            ? diff
            : timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        });
      }
    }
  }

  return Array.from(employeeMap.values());
}

// ─────────────────────────────────────────────────────────────────────────────

export async function parseExcelFile(
  file: File,
): Promise<ParsedScheduleResult> {
  const xlsxModule = await loadXLSX();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = xlsxModule.read(data, {
          type: "binary",
          cellDates: true,
        });

        // ── 1. Vodafone/Randstad Airport format (multi-sheet, month-per-sheet) ──
        // Attach xlsxLib reference so parseVodafoneAirportWorkbook can use it
        workbook._xlsxLib = xlsxModule;

        // Quick format check: does the workbook have Portuguese month-named sheets?
        const monthSheetCount = workbook.SheetNames.filter(
          (n: string) => monthFromSheetName(n) !== null,
        ).length;

        if (monthSheetCount >= 2) {
          // Confirm by inspecting the first month sheet's JSON
          const firstMonthSheet = workbook.SheetNames.find(
            (n: string) => monthFromSheetName(n) !== null,
          );
          if (firstMonthSheet) {
            const ws = workbook.Sheets[firstMonthSheet];
            const firstJson: any[][] = xlsxModule.utils.sheet_to_json(ws, {
              header: 1,
              raw: false,
              defval: null,
            });
            if (isVodafoneAirportFormatFromJson(firstJson)) {
              const employees = parseVodafoneAirportWorkbook(workbook);
              return resolve({
                employees,
                format: "vodafone-airport",
              });
            }
          }
        }

        // ── 2. Concentrix wide format ─────────────────────────────────────────
        // Try to find "Schedules" sheet first, otherwise use first sheet
        let sheetName = workbook.SheetNames.find(
          (name: string) => name.toLowerCase() === "schedules",
        );
        if (!sheetName) {
          sheetName = workbook.SheetNames[0];
        }

        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsxModule.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          dateNF: "yyyy-mm-dd",
        }) as any[][];

        const { isMatch, headerRowIndex } = isConcentrixWideFormat(jsonData);

        if (isMatch) {
          const employees = parseConcentrixWideSchedule(
            jsonData,
            headerRowIndex,
          );
          return resolve({
            employees,
            format: "concentrix-wide",
          });
        }

        // ── 3. Simple / legacy format ────────────────────────────────────────
        const shifts = parseSimpleSchedule(jsonData);
        resolve({
          employees: [
            {
              employeeId: "default",
              employeeName: "My Schedule",
              shifts,
            },
          ],
          format: "simple",
        });
      } catch (error) {
        reject(
          new Error(`Failed to parse Excel file: ${getErrorMessage(error)}`),
        );
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsBinaryString(file);
  });
}

export function validateExcelFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
    return {
      valid: false,
      error: "File must be an Excel file (.xlsx or .xls)",
    };
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return { valid: false, error: "File size must be less than 5MB" };
  }

  return { valid: true };
}
