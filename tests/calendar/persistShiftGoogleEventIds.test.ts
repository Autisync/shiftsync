import { beforeEach, describe, expect, it, vi } from "vitest";

const chain = {
  update: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
};

const updateSpy = chain.update.mockImplementation(() => chain);
const eqSpy = chain.eq.mockImplementation(() => chain);
const orSpy = chain.or.mockImplementation(async () => ({ error: null }));

const fromSpy = vi.fn(() => chain);

vi.mock("../../src/lib/supabase-client", () => ({
  getSupabaseClient: () => ({
    from: fromSpy,
  }),
}));

import { persistShiftGoogleEventIds } from "../../src/services/backend/supabase-provider";
import type { ShiftData } from "../../src/types/shift";

function makeShift(overrides: Partial<ShiftData> = {}): ShiftData {
  return {
    id: "shift-1",
    shiftUid: "uid-1",
    week: 1,
    date: new Date("2026-04-22T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "18:00",
    shiftType: "morning",
    status: "active",
    notes: "Google title should never touch role",
    location: "Lisbon",
    googleEventId: "evt-1",
    ...overrides,
  };
}

describe("persistShiftGoogleEventIds", () => {
  beforeEach(() => {
    fromSpy.mockClear();
    updateSpy.mockClear();
    eqSpy.mockClear();
    orSpy.mockClear();
  });

  it("never writes role from Google-derived shift content", async () => {
    await persistShiftGoogleEventIds({
      userId: "user-1",
      shifts: [makeShift()],
    });

    expect(fromSpy).toHaveBeenCalledWith("shifts");
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;

    expect(payload).toEqual(
      expect.objectContaining({
        google_event_id: "evt-1",
        location: "Lisbon",
        status: "active",
      }),
    );
    expect(payload).not.toHaveProperty("role");
  });
});
