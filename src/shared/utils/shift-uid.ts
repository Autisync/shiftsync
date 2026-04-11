import type { ShiftData } from "@/types/shift";

function dateOnly(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeUserId(value: string): string {
  return value.trim();
}

function normalizeTime(value: string): string {
  const [hRaw, mRaw] = value.trim().split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  const hh = Number.isFinite(h) ? String(h).padStart(2, "0") : "00";
  const mm = Number.isFinite(m) ? String(m).padStart(2, "0") : "00";
  return `${hh}:${mm}`;
}

function hashString(input: string): string {
  // 64-bit FNV-1a hash to reduce collision risk vs 32-bit hashes.
  let hash = 0xcbf29ce484222325n;
  const fnvPrime = 0x100000001b3n;
  const mask64 = 0xffffffffffffffffn;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * fnvPrime) & mask64;
  }

  return hash.toString(16).padStart(16, "0");
}

export function buildShiftUid(input: {
  userId: string;
  date: Date;
  startTime: string;
  endTime: string;
  role?: string | null;
  location?: string | null;
}): string {
  // Canonical identity required by reconciliation engine.
  const datePart = dateOnly(input.date);
  const startPart = normalizeTime(input.startTime);
  const endPart = normalizeTime(input.endTime);
  const canonical = [
    normalizeUserId(input.userId),
    datePart,
    startPart,
    endPart,
  ].join("|");

  // Keep date/time visible in the UID to avoid practical collisions across days.
  return `su_${datePart.replace(/-/g, "")}_${startPart.replace(":", "")}_${endPart.replace(":", "")}_${hashString(canonical)}`;
}

export function buildShiftUidFromShift(
  shift: ShiftData,
  userId: string,
): string {
  return buildShiftUid({
    userId,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
}
