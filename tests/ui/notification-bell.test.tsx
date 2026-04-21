// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../../src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import { NotificationBell } from "../../src/components/notifications/notification-bell";
import type { AppNotification } from "../../src/types/domain";

function LocationProbe() {
  const location = useLocation();

  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
}

function makeNotification(): AppNotification {
  return {
    id: "notif-1",
    userId: "user-1",
    type: "swap_request",
    title: "Novo pedido de troca",
    body: "Existe um pedido pendente para rever.",
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z",
    isRead: false,
    readAt: null,
    link: null,
    meta: null,
    entityType: "swap_request",
    entityId: "swap-1",
  };
}

describe("NotificationBell", () => {
  const notification = makeNotification();
  const listNotifications = vi.fn();
  const getUnreadCount = vi.fn();
  const markNotificationAsRead = vi.fn();
  const markAllNotificationsAsRead = vi.fn();
  const backfillSwapRequestNotifications = vi.fn();

  beforeEach(() => {
    listNotifications.mockResolvedValue({ items: [notification], total: 1 });
    getUnreadCount.mockResolvedValue(1);
    markNotificationAsRead.mockResolvedValue(undefined);
    markAllNotificationsAsRead.mockResolvedValue(undefined);
    backfillSwapRequestNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks a notification as read, removes it from the bell, and navigates with entity focus", async () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <NotificationBell
                  userId="user-1"
                  notifications={
                    {
                      listNotifications,
                      getUnreadCount,
                      markNotificationAsRead,
                      markAllNotificationsAsRead,
                      backfillSwapRequestNotifications,
                    } as never
                  }
                  onOpenAll={() => undefined}
                />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("button", {
        name: /Centro de notificações, 1 por ler/i,
      }),
    ).toBeTruthy();

    expect(await screen.findByText("Novo pedido de troca")).toBeTruthy();

    fireEvent.click(screen.getByText("Novo pedido de troca"));

    await waitFor(() => {
      expect(markNotificationAsRead).toHaveBeenCalledWith("notif-1");
      expect(screen.getByTestId("location-display").textContent).toContain(
        "/home/swaps?notificationEntityId=swap-1",
      );
      expect(screen.queryByText("Novo pedido de troca")).toBeNull();
    });
  });
});
