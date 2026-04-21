// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useSessionInactivity } from "../../src/hooks/use-session-inactivity";

function Harness(props: { onWarn: () => void; onExpire: () => void }) {
  const { warningOpen, secondsRemaining, staySignedIn } = useSessionInactivity({
    enabled: true,
    timeoutMs: 5000,
    warningMs: 2000,
    onWarn: props.onWarn,
    onExpire: props.onExpire,
  });

  return (
    <div>
      <span data-testid="warning-state">{warningOpen ? "open" : "closed"}</span>
      <span data-testid="seconds-remaining">{secondsRemaining}</span>
      <button onClick={staySignedIn}>continue</button>
    </div>
  );
}

describe("useSessionInactivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows a warning before expiry, resets when the user stays signed in, and expires after the next idle period", () => {
    const onWarn = vi.fn();
    const onExpire = vi.fn();

    render(<Harness onWarn={onWarn} onExpire={onExpire} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("warning-state").textContent).toBe("open");
    expect(screen.getByTestId("seconds-remaining").textContent).toBe("2");
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("continue"));

    expect(screen.getByTestId("warning-state").textContent).toBe("closed");
    expect(screen.getByTestId("seconds-remaining").textContent).toBe("2");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onWarn).toHaveBeenCalledTimes(2);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
