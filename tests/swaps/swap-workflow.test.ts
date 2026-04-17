import { describe, expect, it } from "vitest";
import {
  assertSwapStatusTransition,
  canSwapStatusTransition,
  getAllowedActionsForUser,
} from "../../src/features/swaps/services/swap-workflow";
import type { SwapRequest } from "../../src/types/domain";

function makeRequest(overrides: Partial<SwapRequest> = {}): SwapRequest {
  const now = new Date().toISOString();
  return {
    id: "req-1",
    requesterUserId: "u-requester",
    targetUserId: "u-target",
    requesterShiftId: "shift-r",
    targetShiftId: "shift-t",
    status: "pending",
    message: null,
    statusHistory: [
      {
        status: "pending",
        changedAt: now,
        changedByUserId: "u-requester",
      },
    ],
    pendingAt: now,
    acceptedAt: null,
    rejectedAt: null,
    submittedToHrAt: null,
    approvedAt: null,
    requesterHrSent: false,
    targetHrSent: false,
    requesterHrApproved: false,
    targetHrApproved: false,
    calendarUpdateEnabled: false,
    ruleViolation: null,
    violationReason: null,
    hrEmailSent: false,
    calendarApplied: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("swap workflow transitions", () => {
  it("allows only the required lifecycle transitions", () => {
    expect(canSwapStatusTransition("pending", "accepted")).toBe(true);
    expect(canSwapStatusTransition("pending", "rejected")).toBe(true);
    expect(canSwapStatusTransition("accepted", "submitted_to_hr")).toBe(true);
    expect(canSwapStatusTransition("submitted_to_hr", "approved")).toBe(true);

    expect(canSwapStatusTransition("accepted", "approved")).toBe(false);
    expect(canSwapStatusTransition("rejected", "accepted")).toBe(false);
    expect(canSwapStatusTransition("approved", "pending")).toBe(false);
  });

  it("throws on invalid transition", () => {
    expect(() => assertSwapStatusTransition("pending", "approved")).toThrow(
      /Invalid swap status transition/,
    );
  });

  it("returns role-appropriate actions for requester and target inboxes", () => {
    const pending = makeRequest({ status: "pending" });
    expect(getAllowedActionsForUser(pending, "u-target")).toEqual([
      "accepted",
      "rejected",
    ]);
    expect(getAllowedActionsForUser(pending, "u-requester")).toEqual([]);

    const awaiting = makeRequest({ status: "awaiting_hr_request" });
    expect(getAllowedActionsForUser(awaiting, "u-requester")).toEqual([
      "ready_to_apply",
    ]);
  });
});
