/**
 * src/services/contracts/shifts.dto.ts
 *
 * Data-transfer objects for ShiftService operations.
 */

import type { Shift } from "@/types/domain";

/**
 * Input to create a shift. All fields required except those computed by
 * the server (id, createdAt, updatedAt).
 */
export type CreateShiftInput = Omit<Shift, "id" | "createdAt" | "updatedAt">;

/**
 * Partial update shape for an existing shift.
 * userId, id, and audit timestamps are not mutable from the frontend.
 */
export type UpdateShiftInput = Partial<
  Omit<Shift, "id" | "userId" | "createdAt" | "updatedAt">
>;
