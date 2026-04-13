import { describe, expect, it } from "vitest";
import { validateScheduleConstraints } from "../../src/features/swaps/services/swap-constraints";

describe("validateScheduleConstraints", () => {
  it("returns valid for compliant schedules", () => {
    const result = validateScheduleConstraints([
      {
        date: "2026-04-06",
        startsAt: "2026-04-06T08:00:00.000Z",
        endsAt: "2026-04-06T16:00:00.000Z",
      },
      {
        date: "2026-04-08",
        startsAt: "2026-04-08T08:00:00.000Z",
        endsAt: "2026-04-08T16:00:00.000Z",
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("flags weekly hours above 60", () => {
    const shifts = Array.from({ length: 6 }, (_, index) => {
      const day = String(index + 6).padStart(2, "0");
      return {
        date: `2026-04-${day}`,
        startsAt: `2026-04-${day}T08:00:00.000Z`,
        endsAt: `2026-04-${day}T19:00:00.000Z`,
      };
    });

    const result = validateScheduleConstraints(shifts);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === "MAX_HOURS_EXCEEDED")).toBe(
      true,
    );
  });

  it("flags more than 6 consecutive worked days", () => {
    const shifts = Array.from({ length: 7 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return {
        date: `2026-04-${day}`,
        startsAt: `2026-04-${day}T09:00:00.000Z`,
        endsAt: `2026-04-${day}T17:00:00.000Z`,
      };
    });

    const result = validateScheduleConstraints(shifts);

    expect(result.valid).toBe(false);
    expect(
      result.violations.some(
        (v) => v.code === "MAX_CONSECUTIVE_DAYS_EXCEEDED",
      ),
    ).toBe(true);
  });

  it("flags minimum rest violations only when the option is enabled", () => {
    const shifts = [
      {
        date: "2026-04-01",
        startsAt: "2026-04-01T14:00:00.000Z",
        endsAt: "2026-04-01T22:00:00.000Z",
      },
      {
        date: "2026-04-02",
        startsAt: "2026-04-02T05:00:00.000Z",
        endsAt: "2026-04-02T13:00:00.000Z",
      },
    ];

    const withoutRestRule = validateScheduleConstraints(shifts);
    const withRestRule = validateScheduleConstraints(shifts, {
      enforceMinRestHours: true,
      minRestHours: 11,
    });

    expect(withoutRestRule.violations.some((v) => v.code === "MIN_REST_HOURS_VIOLATED")).toBe(false);
    expect(withRestRule.violations.some((v) => v.code === "MIN_REST_HOURS_VIOLATED")).toBe(true);
  });
});
