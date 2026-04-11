import { describe, expect, it } from "vitest";
import { buildRankedSwapMatches } from "../../src/features/swaps/services/swap-matching";
import type { Shift, SwapAvailability } from "../../src/types/domain";

function makeShift(input: {
  id: string;
  userId: string;
  date: string;
  start: string;
  end: string;
}): Shift {
  return {
    id: input.id,
    userId: input.userId,
    date: input.date,
    startsAt: `${input.date}T${input.start}:00.000Z`,
    endsAt: `${input.date}T${input.end}:00.000Z`,
    role: "agent",
    location: "Lisbon",
    googleEventId: null,
    sourceUploadId: null,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shiftUid: null,
    uploadBatchId: null,
    lastSeenAt: null,
  };
}

function makeAvailability(id: string, shiftId: string): SwapAvailability {
  const now = new Date().toISOString();
  return {
    id,
    shiftId,
    isOpen: true,
    openedByUserId: "u-target",
    openedAt: now,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("swap matching engine", () => {
  it("ranks exact match highest over overlap and same-day fallback", () => {
    const ownShift = makeShift({
      id: "own-1",
      userId: "u-own",
      date: "2026-04-20",
      start: "09:00",
      end: "18:00",
    });

    const exact = makeShift({
      id: "target-exact",
      userId: "u-target",
      date: "2026-04-20",
      start: "09:00",
      end: "18:00",
    });

    const overlap = makeShift({
      id: "target-overlap",
      userId: "u-target",
      date: "2026-04-20",
      start: "10:00",
      end: "19:00",
    });

    const sameDay = makeShift({
      id: "target-same-day",
      userId: "u-target",
      date: "2026-04-20",
      start: "20:00",
      end: "23:00",
    });

    const matches = buildRankedSwapMatches({
      userId: "u-own",
      ownShifts: [ownShift],
      openAvailabilities: [
        { shift: sameDay, availability: makeAvailability("a-3", sameDay.id) },
        { shift: overlap, availability: makeAvailability("a-2", overlap.id) },
        { shift: exact, availability: makeAvailability("a-1", exact.id) },
      ],
    });

    expect(matches).toHaveLength(3);
    expect(matches[0]?.strategy).toBe("exact");
    expect(matches[1]?.strategy).toBe("overlap");
    expect(matches[2]?.strategy).toBe("same_day");
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0);
    expect(matches[1]?.score).toBeGreaterThan(matches[2]?.score ?? 0);
  });

  it("does not expose own-user open availability as candidate match", () => {
    const ownShift = makeShift({
      id: "own-1",
      userId: "u-own",
      date: "2026-04-21",
      start: "09:00",
      end: "18:00",
    });

    const ownCandidate = makeShift({
      id: "own-2",
      userId: "u-own",
      date: "2026-04-21",
      start: "09:00",
      end: "18:00",
    });

    const matches = buildRankedSwapMatches({
      userId: "u-own",
      ownShifts: [ownShift],
      openAvailabilities: [
        {
          shift: ownCandidate,
          availability: makeAvailability("a-own", ownCandidate.id),
        },
      ],
    });

    expect(matches).toHaveLength(0);
  });

  it("includes score rationale for ranking transparency", () => {
    const ownShift = makeShift({
      id: "own-1",
      userId: "u-own",
      date: "2026-04-22",
      start: "09:00",
      end: "18:00",
    });

    const overlap = makeShift({
      id: "target-1",
      userId: "u-target",
      date: "2026-04-22",
      start: "11:00",
      end: "20:00",
    });

    const matches = buildRankedSwapMatches({
      userId: "u-own",
      ownShifts: [ownShift],
      openAvailabilities: [
        { shift: overlap, availability: makeAvailability("a-1", overlap.id) },
      ],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.rationale.length).toBeGreaterThan(0);
  });
});
