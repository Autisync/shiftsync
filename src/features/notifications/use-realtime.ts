/**
 * src/features/notifications/use-realtime.ts
 *
 * Subscribes to Supabase Realtime channels for live updates on:
 *   - swap_requests
 *   - leave_requests
 *   - notifications
 *
 * Gated by VITE_ENABLE_REALTIME and backendMode=supabase.
 * Emits "in-app-notification-created" custom DOM events so that the
 * NotificationBell can refresh without a prop-drilling callback.
 *
 * Usage:
 *   useRealtime({ userId, onSwapChange, onLeaveChange, onNotification });
 */

import { useEffect, useRef } from "react";
import { getConfig } from "@/config/env";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface UseRealtimeOptions {
  /** The authenticated user's ID. Pass null/undefined to skip subscriptions. */
  userId: string | null | undefined;
  /** Called (silent=true) when a swap_request row changes for this user. */
  onSwapChange?: () => void;
  /** Called (silent=true) when a leave_request row changes for this user. */
  onLeaveChange?: () => void;
  /** Called when a notification row is inserted for this user. */
  onNotification?: () => void;
}

/**
 * Emits the "in-app-notification-created" custom event so that all mounted
 * NotificationBell components refresh their badge count.
 */
function emitNotificationEvent(userId: string) {
  window.dispatchEvent(
    new CustomEvent("in-app-notification-created", { detail: { userId } }),
  );
}

export function useRealtime({
  userId,
  onSwapChange,
  onLeaveChange,
  onNotification,
}: UseRealtimeOptions): void {
  // Stable refs so channel callbacks always see the latest handlers
  const onSwapChangeRef = useRef(onSwapChange);
  const onLeaveChangeRef = useRef(onLeaveChange);
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onSwapChangeRef.current = onSwapChange;
  }, [onSwapChange]);

  useEffect(() => {
    onLeaveChangeRef.current = onLeaveChange;
  }, [onLeaveChange]);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    const config = getConfig();

    // Only subscribe when realtime is enabled and we have a user
    if (!config.features.enableRealtime) return;
    if (config.backendMode !== "supabase") return;
    if (!userId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channels: RealtimeChannel[] = [];

    // ── swap_requests ──────────────────────────────────────────────────────
    const swapChannel = supabase
      .channel(`swap_requests:user:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swap_requests",
          filter: `requester_user_id=eq.${userId}`,
        },
        () => {
          onSwapChangeRef.current?.();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swap_requests",
          filter: `target_user_id=eq.${userId}`,
        },
        () => {
          onSwapChangeRef.current?.();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.debug("[Realtime] swap_requests subscribed for", userId);
        }
      });

    channels.push(swapChannel);

    // ── leave_requests ─────────────────────────────────────────────────────
    const leaveChannel = supabase
      .channel(`leave_requests:user:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_requests",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          onLeaveChangeRef.current?.();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.debug("[Realtime] leave_requests subscribed for", userId);
        }
      });

    channels.push(leaveChannel);

    // ── notifications ──────────────────────────────────────────────────────
    const notifChannel = supabase
      .channel(`notifications:user:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          emitNotificationEvent(userId);
          onNotificationRef.current?.();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.debug("[Realtime] notifications subscribed for", userId);
        }
      });

    channels.push(notifChannel);

    return () => {
      channels.forEach((ch) => {
        supabase.removeChannel(ch).catch((err: unknown) => {
          console.warn("[Realtime] channel removal failed", err);
        });
      });
    };
  }, [userId]);
}
