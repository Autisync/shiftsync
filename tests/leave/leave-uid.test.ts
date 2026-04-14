import { describe, expect, it } from "vitest";
import { computeLeaveUID } from "../../src/features/leave/services/leave-uid";

describe("computeLeaveUID", () => {
  it("returns a 64-character hex string", async () => {
    const uid = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    expect(uid).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same inputs produce the same UID", async () => {
    const a = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    const b = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    expect(a).toBe(b);
  });

  it("differs when userId changes", async () => {
    const a = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    const b = await computeLeaveUID(
      "user-2",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    expect(a).not.toBe(b);
  });

  it("differs when leave type changes", async () => {
    const a = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    const b = await computeLeaveUID(
      "user-1",
      "sick",
      "2026-06-01",
      "2026-06-07",
    );
    expect(a).not.toBe(b);
  });

  it("differs when start date changes", async () => {
    const a = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    const b = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-02",
      "2026-06-07",
    );
    expect(a).not.toBe(b);
  });

  it("differs when end date changes", async () => {
    const a = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    const b = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-08",
    );
    expect(a).not.toBe(b);
  });

  it("returns a different hash if any segment changes (avalanche)", async () => {
    const base = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-01",
      "2026-06-07",
    );
    const swapped = await computeLeaveUID(
      "user-1",
      "vacation",
      "2026-06-07",
      "2026-06-01",
    );
    // swapped start/end should produce a different hash
    expect(base).not.toBe(swapped);
  });
});
