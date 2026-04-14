import { describe, expect, it } from "vitest";
import {
  canLeaveStatusTransition,
  assertLeaveStatusTransition,
  formatLeaveStatus,
  getLeaveStatusBadgeClass,
  getLeaveTypeLabel,
  getLeaveDurationDays,
  isVacationType,
  getEffectiveLeaveDates,
  getLeaveCalendarTitle,
  LEAVE_TYPES,
} from "../../src/features/leave/services/leave-workflow";

describe("leave-workflow: status transitions", () => {
  it("allows draft → pending", () => {
    expect(canLeaveStatusTransition("draft", "pending")).toBe(true);
  });

  it("allows pending → approved", () => {
    expect(canLeaveStatusTransition("pending", "approved")).toBe(true);
  });

  it("allows pending → rejected", () => {
    expect(canLeaveStatusTransition("pending", "rejected")).toBe(true);
  });

  it("allows pending → soft_declined (expiry)", () => {
    expect(canLeaveStatusTransition("pending", "soft_declined")).toBe(true);
  });

  it("blocks draft → approved (must go through pending first)", () => {
    expect(canLeaveStatusTransition("draft", "approved")).toBe(false);
  });

  it("blocks approved → pending (no reverse)", () => {
    expect(canLeaveStatusTransition("approved", "pending")).toBe(false);
  });

  it("blocks approved → rejected (terminal state)", () => {
    expect(canLeaveStatusTransition("approved", "rejected")).toBe(false);
  });

  it("blocks rejected → approved (terminal state)", () => {
    expect(canLeaveStatusTransition("rejected", "approved")).toBe(false);
  });

  it("blocks soft_declined → approved (terminal state)", () => {
    expect(canLeaveStatusTransition("soft_declined", "approved")).toBe(false);
  });

  it("throws on invalid transition", () => {
    expect(() => assertLeaveStatusTransition("approved", "pending")).toThrow(
      /Invalid leave status transition/,
    );
  });

  it("does not throw on valid transition", () => {
    expect(() =>
      assertLeaveStatusTransition("pending", "approved"),
    ).not.toThrow();
  });
});

describe("leave-workflow: display helpers", () => {
  it("formats draft status in Portuguese", () => {
    expect(formatLeaveStatus("draft")).toBe("Rascunho");
  });

  it("formats pending status in Portuguese", () => {
    expect(formatLeaveStatus("pending")).toBe("Pendente");
  });

  it("formats approved status in Portuguese", () => {
    expect(formatLeaveStatus("approved")).toBe("Aprovado");
  });

  it("formats rejected status in Portuguese", () => {
    expect(formatLeaveStatus("rejected")).toBe("Rejeitado");
  });

  it("formats soft_declined status in Portuguese", () => {
    expect(formatLeaveStatus("soft_declined")).toBe("Expirado");
  });

  it("returns amber badge class for pending", () => {
    expect(getLeaveStatusBadgeClass("pending")).toContain("amber");
  });

  it("returns emerald badge class for approved", () => {
    expect(getLeaveStatusBadgeClass("approved")).toContain("emerald");
  });

  it("returns rose badge class for rejected", () => {
    expect(getLeaveStatusBadgeClass("rejected")).toContain("rose");
  });

  it("returns zinc badge class for soft_declined", () => {
    expect(getLeaveStatusBadgeClass("soft_declined")).toContain("zinc");
  });
});

describe("leave-workflow: type labels", () => {
  it("returns Portuguese label for vacation", () => {
    expect(getLeaveTypeLabel("vacation")).toBe("Férias");
  });

  it("returns Portuguese label for sick", () => {
    expect(getLeaveTypeLabel("sick")).toBe("Doença");
  });

  it("returns fallback for unknown type", () => {
    expect(getLeaveTypeLabel("unknown_type")).toBe("unknown_type");
  });

  it("LEAVE_TYPES covers all expected categories", () => {
    const values = LEAVE_TYPES.map((t) => t.value);
    expect(values).toContain("vacation");
    expect(values).toContain("sick");
    expect(values).toContain("personal");
    expect(values).toContain("other");
  });
});

describe("leave-workflow: duration calculation", () => {
  it("returns 1 for same-day leave", () => {
    expect(getLeaveDurationDays("2026-04-13", "2026-04-13")).toBe(1);
  });

  it("returns 3 for Mon–Wed", () => {
    expect(getLeaveDurationDays("2026-04-13", "2026-04-15")).toBe(3);
  });

  it("returns 7 for a full week", () => {
    expect(getLeaveDurationDays("2026-04-13", "2026-04-19")).toBe(7);
  });
});

describe("leave-workflow: vacation helpers", () => {
  it("identifies vacation type correctly", () => {
    expect(isVacationType("vacation")).toBe(true);
    expect(isVacationType("sick")).toBe(false);
    expect(isVacationType("personal")).toBe(false);
  });
});

describe("leave-workflow: effective dates", () => {
  it("returns requested dates when no approved dates", () => {
    const result = getEffectiveLeaveDates({
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      approvedStartDate: null,
      approvedEndDate: null,
    });
    expect(result.startDate).toBe("2026-06-01");
    expect(result.endDate).toBe("2026-06-10");
  });

  it("returns approved dates when set", () => {
    const result = getEffectiveLeaveDates({
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      approvedStartDate: "2026-06-02",
      approvedEndDate: "2026-06-09",
    });
    expect(result.startDate).toBe("2026-06-02");
    expect(result.endDate).toBe("2026-06-09");
  });
});

describe("leave-workflow: calendar title", () => {
  it("uses Férias for vacation", () => {
    expect(getLeaveCalendarTitle("vacation")).toBe("Férias");
  });

  it("uses Baixa Médica for sick", () => {
    expect(getLeaveCalendarTitle("sick")).toBe("Baixa Médica");
  });

  it("uses Ausência Aprovada for unknown type", () => {
    expect(getLeaveCalendarTitle("other")).toBe("Ausência Aprovada");
  });
});
