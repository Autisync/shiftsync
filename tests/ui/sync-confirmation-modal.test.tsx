// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncConfirmationModal } from "../../src/components/sync/sync-confirmation-modal";

vi.mock("../../src/lib/google-calendar", () => {
  class GoogleCalendarService {
    constructor(_accessToken: string) {}

    async listCalendars() {
      return [
        {
          id: "primary",
          summary: "Primary",
          primary: true,
          backgroundColor: "#4f46e5",
        },
      ];
    }

    async createCalendar(name: string) {
      return {
        id: "created",
        summary: name,
        primary: false,
      };
    }
  }

  return { GoogleCalendarService };
});

describe("SyncConfirmationModal preview list", () => {
  it("renders update changes with reason and schedule details", async () => {
    render(
      <SyncConfirmationModal
        open
        onClose={() => undefined}
        onConfirm={() => undefined}
        summary={{ create: 0, update: 1, delete: 0, noop: 0, failed: 0 }}
        changes={[
          {
            type: "update",
            reason: "Fingerprint changed",
            syncShiftKey: "user-1::uid:su_abc123",
            date: "2026-04-15",
            start: "2026-04-15T09:00:00.000Z",
            end: "2026-04-15T18:00:00.000Z",
            title: "OPS - Morning",
            location: "Lisbon",
          },
        ]}
        onRequestPreview={async () => undefined}
        accessToken="token"
        initialCalendarId="primary"
      />,
    );

    expect(await screen.findByText("Pré-visualização de alterações")).toBeTruthy();
    expect(screen.getByText("Fingerprint changed")).toBeTruthy();
    expect(screen.getByText("OPS - Morning")).toBeTruthy();
    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.getByText("2026-04-15")).toBeTruthy();
    expect(screen.getByText("update")).toBeTruthy();
  });
});
