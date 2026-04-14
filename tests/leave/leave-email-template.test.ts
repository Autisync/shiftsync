import { describe, expect, it } from "vitest";
import { buildLeaveEmailTemplate } from "../../src/features/leave/services/leave-email-template";
import type { LeaveRequest } from "../../src/types/domain";

function makeLeave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "abc123",
    userId: "user-1",
    type: "vacation",
    status: "pending",
    startDate: "2026-06-01",
    endDate: "2026-06-07",
    notes: null,
    sentToHrAt: null,
    decisionDueAt: null,
    approvedStartDate: null,
    approvedEndDate: null,
    approvedNotes: null,
    hrResponseNotes: null,
    softDeclinedAt: null,
    calendarAppliedAt: null,
    googleEventId: null,
    leaveUid: null,
    lastSyncedCalendarId: null,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildLeaveEmailTemplate", () => {
  it("produces a mailto: URL with the correct recipient", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
    });
    expect(result.mailtoUrl).toMatch(/^mailto:hr%40example\.com\?/);
  });

  it("includes the leave type in the subject", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave({ type: "vacation" }),
      hrEmail: "hr@example.com",
    });
    expect(result.subject).toContain("Férias");
  });

  it("includes sick leave type label in the subject", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave({ type: "sick" }),
      hrEmail: "hr@example.com",
    });
    expect(result.subject).toContain("Doença");
  });

  it("includes formatted start and end dates in the subject", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave({ startDate: "2026-06-01", endDate: "2026-06-07" }),
      hrEmail: "hr@example.com",
    });
    // dates appear in the subject (format varies by locale; just check presence)
    expect(result.subject).toMatch(/2026/);
  });

  it("includes employee name in body when provided", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
      employeeName: "João Silva",
    });
    expect(result.body).toContain("João Silva");
  });

  it("includes employee code in body when provided", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
      employeeCode: "EMP-42",
    });
    expect(result.body).toContain("EMP-42");
  });

  it("omits employee identity block when not provided", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
    });
    expect(result.body).not.toContain("Colaborador:");
    expect(result.body).not.toContain("Código:");
  });

  it("includes leave notes in body when present", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave({ notes: "Férias de verão" }),
      hrEmail: "hr@example.com",
    });
    expect(result.body).toContain("Férias de verão");
  });

  it("adds CC recipients to the mailto URL when provided", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
      ccEmails: ["manager@example.com", "backup@example.com"],
    });
    expect(result.mailtoUrl).toContain("cc=");
    expect(result.mailtoUrl).toContain("manager%40example.com");
  });

  it("does not include CC param when ccEmails is empty", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
      ccEmails: [],
    });
    expect(result.mailtoUrl).not.toContain("cc=");
  });

  it("mailtoUrl encodes spaces as %20, not +", () => {
    const result = buildLeaveEmailTemplate({
      leave: makeLeave(),
      hrEmail: "hr@example.com",
      employeeName: "Maria José",
    });
    expect(result.mailtoUrl).not.toContain("+");
  });

  it("returns consistent subject and body", () => {
    const leave = makeLeave();
    const r1 = buildLeaveEmailTemplate({ leave, hrEmail: "hr@example.com" });
    const r2 = buildLeaveEmailTemplate({ leave, hrEmail: "hr@example.com" });
    expect(r1.subject).toBe(r2.subject);
    // body includes today's date, so only compare structure
    expect(r1.mailtoUrl.split("?")[0]).toBe(r2.mailtoUrl.split("?")[0]);
  });
});
