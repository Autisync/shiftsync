// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LeaveRequestForm } from "../../src/components/leave/LeaveRequestForm";
import type { LeaveRequest } from "../../src/types/domain";

vi.mock("../../src/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("../../src/components/ui/calendar", () => ({
  Calendar: () => <div data-testid="calendar-mock" />,
}));

vi.mock("../../src/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../../src/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("../../src/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const toastSuccess = vi.fn();

vi.mock("../../src/lib/app-toast", () => ({
  appToast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

function makeLeave(): LeaveRequest {
  return {
    id: "leave-1",
    userId: "user-1",
    type: "sick",
    startDate: "2026-04-21",
    endDate: "2026-04-21",
    notes: "Atestado médico",
    status: "draft",
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
    createdAt: "2026-04-21T10:00:00.000Z",
    updatedAt: "2026-04-21T10:00:00.000Z",
  };
}

describe("LeaveRequestForm", () => {
  const createLeaveRequest = vi.fn();
  const createLeaveEmailPreview = vi.fn();
  const confirmLeaveSubmission = vi.fn();
  const onCreated = vi.fn();
  const onSentToHR = vi.fn();

  beforeEach(() => {
    createLeaveRequest.mockResolvedValue(makeLeave());
    createLeaveEmailPreview.mockResolvedValue({
      subject: "[ShiftSync] Pedido de sick (2026-04-21 a 2026-04-21)",
      to: ["hr@example.com"],
      cc: ["manager@example.com"],
      body: [
        "Bom dia RH,",
        "",
        "Ações rápidas RH (link seguro de uso único):",
        "Aprovar: https://example.com/approve",
        "Recusar: https://example.com/decline",
      ].join("\n"),
      attachments: [
        {
          fileName: "medical-note.pdf",
          fileType: "application/pdf",
          fileSize: 12,
        },
      ],
    });
    confirmLeaveSubmission.mockResolvedValue({
      ...makeLeave(),
      status: "pending",
      sentToHrAt: "2026-04-21T10:05:00.000Z",
      decisionDueAt: "2026-05-21T10:05:00.000Z",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  function renderForm() {
    render(
      <LeaveRequestForm
        userId="user-1"
        userShifts={[]}
        leaveService={
          {
            createLeaveRequest,
            createLeaveEmailPreview,
            confirmLeaveSubmission,
          } as never
        }
        hrEmail="hr@example.com"
        ccEmails={["manager@example.com"]}
        employeeName="Mauro"
        employeeCode="EMP-1"
        onCreated={onCreated}
        onSentToHR={onSentToHR}
      />,
    );
  }

  function clickPrimarySave() {
    const saveButton = screen
      .getAllByRole("button", { name: /guardar pedido/i })
      .find((button) => !button.hasAttribute("disabled"));

    if (!saveButton) {
      throw new Error("Enabled save button not found");
    }

    fireEvent.click(saveButton);
  }

  it("shows the leave preview without the adjustment link", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/tipo de ausência/i), {
      target: { value: "sick" },
    });

    const file = new File(["pdf-data"], "medical-note.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(screen.getByLabelText(/anexos/i), {
      target: { files: [file] },
    });

    clickPrimarySave();

    expect(
      await screen.findByRole("heading", {
        name: /pré-visualização do email/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/aprovar:/i)).toBeTruthy();
    expect(screen.getByText(/recusar:/i)).toBeTruthy();
    expect(screen.queryByText(/solicitar ajustes:/i)).toBeNull();
  });

  it("passes the uploaded File through when confirming the HR send", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/tipo de ausência/i), {
      target: { value: "sick" },
    });

    const file = new File(["pdf-data"], "medical-note.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(screen.getByLabelText(/anexos/i), {
      target: { files: [file] },
    });

    clickPrimarySave();

    await screen.findByRole("heading", { name: /pré-visualização do email/i });

    fireEvent.click(
      screen.getByRole("button", { name: /confirmar e enviar ao rh/i }),
    );

    await waitFor(() => {
      expect(confirmLeaveSubmission).toHaveBeenCalledTimes(1);
    });

    const submission = confirmLeaveSubmission.mock.calls[0][0];
    expect(submission.leaveRequestId).toBe("leave-1");
    expect(submission.attachments).toHaveLength(1);
    expect(submission.attachments[0].fileName).toBe("medical-note.pdf");
    expect(submission.attachments[0].file).toBe(file);
    expect(onSentToHR).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Pedido enviado ao RH com os anexos incluídos.",
    );
  });
});
