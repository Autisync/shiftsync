/**
 * src/features/leave/services/leave-uid.ts
 *
 * Deterministic leave identity hash.
 *
 * leave_uid = SHA-256(userId | type | approvedStartDate | approvedEndDate)
 *
 * Used to:
 *   1. Detect when approved dates have changed (different hash = update event).
 *   2. Avoid duplicate calendar events (same hash = same event, just PATCH).
 *
 * Uses the Web Crypto API (available in all modern browsers and Deno Edge Functions).
 * Returns a lowercase hex string (64 chars).
 */

export async function computeLeaveUID(
  userId: string,
  type: string,
  approvedStartDate: string,
  approvedEndDate: string,
): Promise<string> {
  const raw = `${userId}|${type}|${approvedStartDate}|${approvedEndDate}`;
  const bytes = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
