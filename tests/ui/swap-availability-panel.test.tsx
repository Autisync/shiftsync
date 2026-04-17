// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SwapAvailabilityPanel } from "../../src/components/swaps/swap-availability-panel";
import type {
  Shift,
  SwapAvailability,
  SwapRequest,
} from "../../src/types/domain";

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

function makeRequest(overrides: Partial<SwapRequest> = {}): SwapRequest {
  const now = new Date().toISOString();
  return {
    id: "r-1",
    requesterUserId: "u-own",
    targetUserId: "u-target",
    requesterShiftId: "s-1",
    targetShiftId: "t-1",
    status: "pending",
    message: null,
    statusHistory: [
      {
        status: "pending",
        changedAt: now,
        changedByUserId: "u-own",
      },
    ],
    pendingAt: now,
    acceptedAt: null,
    rejectedAt: null,
    submittedToHrAt: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("SwapAvailabilityPanel", () => {
  it("handles empty and no-match UI states", async () => {
    const backend = {
      shifts: {
        getShiftsForUser: vi.fn().mockResolvedValue([
          makeShift({
            id: "s-1",
            userId: "u-own",
            date: "2026-04-20",
            start: "09:00",
            end: "18:00",
          }),
        ]),
      },
      swaps: {
        getOpenAvailabilities: vi.fn().mockResolvedValue([]),
        getSwapRequestsForUser: vi.fn().mockResolvedValue([]),
        openAvailability: vi.fn(),
        closeAvailability: vi.fn(),
        createSwapRequest: vi.fn(),
        updateSwapStatus: vi.fn(),
        acceptSwapRequest: vi.fn(),
        markHREmailSent: vi.fn(),
        applySwap: vi.fn(),
        getHRSettings: vi.fn().mockResolvedValue(null),
        saveHRSettings: vi.fn(),
      },
      users: {
        getUserProfile: vi.fn().mockResolvedValue(null),
      },
    };

    render(
      <SwapAvailabilityPanel
        userId="u-own"
        enabled
        backend={backend as never}
      />,
    );

    expect(await screen.findByText("Disponibilidade para Trocas")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Sem matches no momento.")).toBeTruthy();
    });
  });

  it("shows error state when loading fails", async () => {
    const backend = {
      shifts: {
        getShiftsForUser: vi.fn().mockRejectedValue(new Error("boom")),
      },
      swaps: {
        getOpenAvailabilities: vi.fn().mockResolvedValue([
          {
            shift: makeShift({
              id: "t-1",
              userId: "u-target",
              date: "2026-04-20",
              start: "09:00",
              end: "18:00",
            }),
            availability: makeAvailability("a-1", "t-1"),
          },
        ]),
        getSwapRequestsForUser: vi.fn().mockResolvedValue([]),
        openAvailability: vi.fn(),
        closeAvailability: vi.fn(),
        createSwapRequest: vi.fn(),
        updateSwapStatus: vi.fn(),
        acceptSwapRequest: vi.fn(),
        markHREmailSent: vi.fn(),
        applySwap: vi.fn(),
        getHRSettings: vi.fn().mockResolvedValue(null),
        saveHRSettings: vi.fn(),
      },
      users: {
        getUserProfile: vi.fn().mockResolvedValue(null),
      },
    };

    render(
      <SwapAvailabilityPanel
        userId="u-own"
        enabled
        backend={backend as never}
      />,
    );

    expect(await screen.findByText(/Erro ao carregar trocas:/)).toBeTruthy();
  });

  it("shows target inbox actions and updates status", async () => {
    const updateSwapStatus = vi.fn().mockResolvedValue(
      makeRequest({
        id: "r-2",
        requesterUserId: "u-other",
        targetUserId: "u-own",
        status: "accepted",
      }),
    );

    const backend = {
      users: {
        getUserProfile: vi.fn().mockResolvedValue({
          id: "u-own",
          employeeCode: "E001",
          fullName: "User Own",
          email: "own@example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      },
      shifts: {
        getShiftsForUser: vi.fn().mockResolvedValue([
          makeShift({
            id: "s-1",
            userId: "u-own",
            date: "2026-04-20",
            start: "09:00",
            end: "18:00",
          }),
        ]),
        getShiftById: vi.fn().mockResolvedValue(
          makeShift({
            id: "s-1",
            userId: "u-own",
            date: "2026-04-20",
            start: "09:00",
            end: "18:00",
          }),
        ),
      },
      swaps: {
        getOpenAvailabilities: vi.fn().mockResolvedValue([]),
        getSwapRequestsForUser: vi.fn().mockResolvedValue([
          makeRequest({
            id: "r-2",
            requesterUserId: "u-other",
            targetUserId: "u-own",
            requesterShiftId: "s-other",
            targetShiftId: "s-1",
            status: "pending",
          }),
        ]),
        openAvailability: vi.fn(),
        closeAvailability: vi.fn(),
        createSwapRequest: vi.fn(),
        updateSwapStatus,
        acceptSwapRequest: vi.fn(),
        markHREmailSent: vi.fn(),
        applySwap: vi.fn(),
        getHRSettings: vi.fn().mockResolvedValue(null),
        saveHRSettings: vi.fn(),
      },
    };

    render(
      <SwapAvailabilityPanel
        userId="u-own"
        enabled
        backend={backend as never}
      />,
    );

    const acceptButton = await screen.findByRole("button", {
      name: "Aceitar pedido",
    });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(updateSwapStatus).toHaveBeenCalledWith("r-2", "accepted", "u-own");
    });
  });

  it("shows pending notification banners for received and sent requests", async () => {
    const backend = {
      shifts: {
        getShiftsForUser: vi.fn().mockResolvedValue([
          makeShift({
            id: "s-1",
            userId: "u-own",
            date: "2026-04-20",
            start: "09:00",
            end: "18:00",
          }),
        ]),
      },
      swaps: {
        getOpenAvailabilities: vi.fn().mockResolvedValue([]),
        getSwapRequestsForUser: vi.fn().mockResolvedValue([
          makeRequest({
            id: "r-sent",
            requesterUserId: "u-own",
            targetUserId: "u-target",
            status: "pending",
          }),
          makeRequest({
            id: "r-received",
            requesterUserId: "u-target",
            targetUserId: "u-own",
            status: "pending",
          }),
        ]),
        openAvailability: vi.fn(),
        closeAvailability: vi.fn(),
        createSwapRequest: vi.fn(),
        updateSwapStatus: vi.fn(),
        acceptSwapRequest: vi.fn(),
        markHREmailSent: vi.fn(),
        applySwap: vi.fn(),
        getHRSettings: vi.fn().mockResolvedValue(null),
        saveHRSettings: vi.fn(),
      },
      users: {
        getUserProfile: vi.fn().mockResolvedValue(null),
      },
    };

    render(
      <SwapAvailabilityPanel
        userId="u-own"
        enabled
        backend={backend as never}
      />,
    );

    expect(
      await screen.findByText(/pedido\(s\) de troca pendente\(s\) para rever/i),
    ).toBeTruthy();
    expect(
      await screen.findByText(/pedido\(s\) enviado\(s\) a aguardar resposta/i),
    ).toBeTruthy();
  });
});
