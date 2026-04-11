import { describe, expect, it } from "vitest";
import { buildShiftUid } from "../../src/shared/utils/shift-uid";

describe("shift uid normalization", () => {
  it("keeps uid stable for normalized times and trimmed user id", () => {
    const date = new Date("2026-04-11T00:00:00");

    const uidA = buildShiftUid({
      userId: " user-1 ",
      date,
      startTime: "9:0",
      endTime: "17:0",
    });

    const uidB = buildShiftUid({
      userId: "user-1",
      date,
      startTime: "09:00",
      endTime: "17:00",
    });

    expect(uidA).toBe(uidB);
  });

  it("produces different uid for adjacent days with same hours", () => {
    const uidA = buildShiftUid({
      userId: "user-1",
      date: new Date("2026-02-20T00:00:00"),
      startTime: "09:00",
      endTime: "18:00",
    });

    const uidB = buildShiftUid({
      userId: "user-1",
      date: new Date("2026-02-21T00:00:00"),
      startTime: "09:00",
      endTime: "18:00",
    });

    expect(uidA).not.toBe(uidB);
  });
});
