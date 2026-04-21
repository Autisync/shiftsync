// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useAuth } from "../../src/hooks/use-auth";
import type { AuthSession, UserProfile } from "../../src/types/domain";

const authState = {
  callback: null as null | ((session: AuthSession | null) => void),
};

const getSession = vi.fn<() => Promise<AuthSession | null>>();
const getUserProfile = vi.fn<(_: string) => Promise<UserProfile | null>>();

vi.mock("../../src/services/backend/backend-provider", () => ({
  getBackend: () => ({
    auth: {
      getSession,
      onAuthChange: (callback: (session: AuthSession | null) => void) => {
        authState.callback = callback;
        return () => {
          authState.callback = null;
        };
      },
    },
    users: {
      getUserProfile,
    },
  }),
}));

function Harness() {
  const { isLoading, isAuthenticated, profile } = useAuth();

  return (
    <div>
      <span data-testid="loading">{isLoading ? "yes" : "no"}</span>
      <span data-testid="authenticated">{isAuthenticated ? "yes" : "no"}</span>
      <span data-testid="profile-name">{profile?.fullName ?? "none"}</span>
    </div>
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      providerToken: null,
    });
    getUserProfile.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      fullName: "Utilizador Teste",
      employeeCode: "E001",
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
    });
  });

  afterEach(() => {
    authState.callback = null;
    vi.clearAllMocks();
  });

  it("drops the authenticated state when the backend reports session expiry", async () => {
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("no");
      expect(screen.getByTestId("authenticated").textContent).toBe("yes");
      expect(screen.getByTestId("profile-name").textContent).toBe(
        "Utilizador Teste",
      );
    });

    await act(async () => {
      authState.callback?.(null);
    });

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("no");
      expect(screen.getByTestId("profile-name").textContent).toBe("none");
    });
  });
});
