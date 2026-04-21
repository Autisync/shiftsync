import { describe, expect, it } from "vitest";
import { generateSwapEmailTemplate } from "../../src/lib/swap-email-template";
import type { Shift, SwapRequest, UserProfile } from "../../src/types/domain";

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    employeeCode: "EMP-100",
    fullName: "Colaborador",
    email: "colaborador@example.com",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    userId: "user-1",
    date: "2026-05-02",
    startsAt: "2026-05-02T08:00:00.000Z",
    endsAt: "2026-05-02T16:00:00.000Z",
    role: "Operator",
    location: "Unit A",
    status: "active",
    shiftUid: null,
    sourceUploadId: null,
    googleEventId: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRequest(overrides: Partial<SwapRequest> = {}): SwapRequest {
  return {
    id: "swap-1",
    requesterUserId: "user-1",
    targetUserId: "user-2",
    requesterShiftId: "shift-r",
    targetShiftId: "shift-t",
    status: "submitted_to_hr",
    message: "Pedido com boa compatibilidade",
    statusHistory: [],
    pendingAt: "2026-04-02T00:00:00.000Z",
    acceptedAt: "2026-04-03T00:00:00.000Z",
    rejectedAt: null,
    submittedToHrAt: "2026-04-03T12:00:00.000Z",
    approvedAt: null,
    requesterHrSent: true,
    targetHrSent: true,
    requesterHrApproved: false,
    targetHrApproved: false,
    calendarUpdateEnabled: false,
    ruleViolation: null,
    violationReason: null,
    hrEmailSent: true,
    calendarApplied: false,
    createdAt: "2026-04-02T08:30:00.000Z",
    updatedAt: "2026-04-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("generateSwapEmailTemplate", () => {
  it("matches snapshot for decision-focused email text", () => {
    const template = generateSwapEmailTemplate({
      request: makeRequest({
        ruleViolation: "MAX_HOURS_EXCEEDED_TARGET",
        violationReason: "O colega excederia 60 horas na semana corrente.",
      }),
      requester: makeUser({
        id: "user-1",
        employeeCode: "EMP-101",
        fullName: "Ana Costa",
        email: "ana@example.com",
      }),
      target: makeUser({
        id: "user-2",
        employeeCode: "EMP-202",
        fullName: "Bruno Lima",
        email: "bruno@example.com",
      }),
      requesterShift: makeShift({
        id: "shift-r",
        userId: "user-1",
        date: "2026-05-10",
        startsAt: "2026-05-10T07:00:00.000Z",
        endsAt: "2026-05-10T15:00:00.000Z",
      }),
      targetShift: makeShift({
        id: "shift-t",
        userId: "user-2",
        date: "2026-05-10",
        startsAt: "2026-05-10T12:00:00.000Z",
        endsAt: "2026-05-10T20:00:00.000Z",
      }),
      hrEmail: "hr@example.com",
      ccEmails: ["ops@example.com", "manager@example.com"],
      approveUrl:
        "https://app.example.com/home/swap/action?token=approve-token&action=approve",
      declineUrl:
        "https://app.example.com/home/swap/action?token=decline-token&action=decline",
      expiresAt: "2026-05-11T12:00:00.000Z",
    });

    expect({
      subject: template.subject,
      body: template.body,
      to: template.to,
      cc: template.cc,
    }).toMatchSnapshot();
  });

  it("keeps decision CTA wording explicit for RH actions", () => {
    const template = generateSwapEmailTemplate({
      request: makeRequest(),
      requester: makeUser({
        id: "user-1",
        employeeCode: "EMP-101",
        fullName: "Ana Costa",
      }),
      target: makeUser({
        id: "user-2",
        employeeCode: "EMP-202",
        fullName: "Bruno Lima",
      }),
      requesterShift: makeShift({
        id: "shift-r",
        userId: "user-1",
      }),
      targetShift: makeShift({
        id: "shift-t",
        userId: "user-2",
      }),
      hrEmail: "hr@example.com",
      ccEmails: ["ops@example.com"],
      approveUrl:
        "https://app.example.com/home/swap/action?token=approve-token&action=approve",
      declineUrl:
        "https://app.example.com/home/swap/action?token=decline-token&action=decline",
      expiresAt: "2026-05-11T12:00:00.000Z",
    });

    expect(template.subject).toContain("[ShiftSync] Ação RH:");
    expect(template.body).toContain("Ações RH (link seguro e de uso único):");
    expect(template.body).toContain("- Aprovar:");
    expect(template.body).toContain("- Recusar:");
    expect(template.body).toContain("- Validade:");
  });
});
