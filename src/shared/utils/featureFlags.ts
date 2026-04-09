/**
 * src/shared/utils/featureFlags.ts
 *
 * Feature flag helpers. Read once from config and memoize.
 * Import these helpers instead of reading import.meta.env directly.
 */

import { getConfig } from "@/config/env";

export function isSwapsEnabled(): boolean {
  return getConfig().features.enableSwaps;
}

export function isLeaveEnabled(): boolean {
  return getConfig().features.enableLeave;
}

export function isSharedRecoveryEnabled(): boolean {
  return getConfig().features.enableSharedRecovery;
}

export function isRealtimeEnabled(): boolean {
  return getConfig().features.enableRealtime;
}

/**
 * Returns a flat snapshot of all feature flags.
 * Useful for logging or debug panels.
 */
export function getFeatureFlags(): Record<string, boolean> {
  const f = getConfig().features;
  return {
    swaps: f.enableSwaps,
    leave: f.enableLeave,
    sharedRecovery: f.enableSharedRecovery,
    realtime: f.enableRealtime,
  };
}
