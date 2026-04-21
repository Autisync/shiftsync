import { useCallback, useEffect, useRef, useState } from "react";

interface UseSessionInactivityOptions {
  enabled: boolean;
  timeoutMs?: number;
  warningMs?: number;
  onWarn?: () => void;
  onExpire: () => void;
}

interface UseSessionInactivityResult {
  warningOpen: boolean;
  secondsRemaining: number;
  staySignedIn: () => void;
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_WARNING_MS = 60 * 1000;

export function useSessionInactivity(
  options: UseSessionInactivityOptions,
): UseSessionInactivityResult {
  const {
    enabled,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    warningMs = DEFAULT_WARNING_MS,
    onWarn,
    onExpire,
  } = options;
  const lastActivityRef = useRef(Date.now());
  const warnedRef = useRef(false);
  const expiredRef = useRef(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.ceil(warningMs / 1000),
  );

  const staySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    expiredRef.current = false;
    setWarningOpen(false);
    setSecondsRemaining(Math.ceil(warningMs / 1000));
  }, [warningMs]);

  useEffect(() => {
    if (!enabled) {
      setWarningOpen(false);
      warnedRef.current = false;
      expiredRef.current = false;
      return;
    }

    const markActivity = () => {
      if (expiredRef.current) {
        return;
      }
      staySignedIn();
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    const tick = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          setWarningOpen(false);
          onExpire();
        }
        return;
      }

      if (remaining <= warningMs) {
        setWarningOpen(true);
        setSecondsRemaining(Math.ceil(remaining / 1000));
        if (!warnedRef.current) {
          warnedRef.current = true;
          onWarn?.();
        }
        return;
      }

      setWarningOpen(false);
      setSecondsRemaining(Math.ceil(warningMs / 1000));
    };

    lastActivityRef.current = Date.now();
    expiredRef.current = false;

    events.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const intervalId = window.setInterval(tick, 1000);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      window.clearInterval(intervalId);
    };
  }, [enabled, onExpire, onWarn, staySignedIn, timeoutMs, warningMs]);

  return {
    warningOpen,
    secondsRemaining,
    staySignedIn,
  };
}
