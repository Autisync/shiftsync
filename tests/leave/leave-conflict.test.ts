import { describe, expect, it } from "vitest";
import { detectLeaveConflicts } from "../../src/features/leave/services/leave-conflict";
import type { Shift } from "../../src/types/domain";

function makeShift(date: string, overrides: Partial<Shift> = {}): Shift {
  const base = new Date(`${date}T08:00:00Z`);
  const end = new Date(`${date}T16:00:00Z`);
  return {
    id: `shift-${date}`,
    userId: "u-1",
    date,
    startsAt: base.toISOString(),
    endsAt: end.toISOString(),
    role: null,
    location: null,
    googleEventId: null,
    sourceUploadId: null,
    createdAt: base.toISOString(),
    updatedAt: base.toISOString(),
    ...overrides,
  };
}

describe("leave-conflict: detectLeaveConflicts", () => {
  const shifts: Shift[] = [
    makeShift("2026-04-14"),
    makeShift("2026-04-15"),
    makeShift("2026-04-20"),
  ];

  it("returns no conflicts when leave is outside all shift dates", () => {
    const result = detectLeaveConflicts(shifts, "2026-04-10", "2026-04-12");
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects single conflict for single-day leave on a shift date", () => {
    const result = detectLeaveConflicts(shifts, "2026-04-14", "2026-04-14");
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].date).toBe("2026-04-14");
  });

  it("detects multiple conflicts when leave spans several shift dates", () => {
    const result = detectLeaveConflicts(shifts, "2026-04-13", "2026-04-16");
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(2);
    const dates = result.conflicts.map((c) => c.date);
    expect(dates).toContain("2026-04-14");
    expect(dates).toContain("2026-04-15");
  });

  it("includes the boundary dates (inclusive range)", () => {
    const result = detectLeaveConflicts(shifts, "2026-04-15", "2026-04-20");
    expect(result.hasConflicts).toBe(true);
    const dates = result.conflicts.map((c) => c.date);
    expect(dates).toContain("2026-04-15");
    expect(dates).toContain("2026-04-20");
  });

  it("returns no conflicts when shift list is empty", () => {
    const result = detectLeaveConflicts([], "2026-04-10", "2026-04-20");
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("conflict entries carry correct shiftId and times", () => {
    const result = detectLeaveConflicts(shifts, "2026-04-20", "2026-04-20");
    expect(result.conflicts[0].shiftId).toBe("shift-2026-04-20");
    expect(result.conflicts[0].startsAt).toBeTruthy();
    expect(result.conflicts[0].endsAt).toBeTruthy();
  });
});
