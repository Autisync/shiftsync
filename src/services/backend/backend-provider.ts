/**
 * src/services/backend/backend-provider.ts
 *
 * Singleton provider selector.
 * Call `getBackend()` anywhere in the app to get the active BackendServices.
 * Provider is chosen by VITE_BACKEND_MODE (supabase | api).
 */

import { getConfig } from "@/config/env";
import type { BackendServices } from "./types";
import { SupabaseProvider } from "./supabase-provider";
import { HttpProvider } from "./http-provider";

let _instance: BackendServices | null = null;

export function getBackend(): BackendServices {
  if (_instance) return _instance;

  const config = getConfig();

  if (config.backendMode === "api") {
    _instance = new HttpProvider(config.apiBaseUrl);
  } else {
    _instance = new SupabaseProvider();
  }

  return _instance;
}

/**
 * Reset the cached provider instance.
 * Useful in tests or when env changes at runtime.
 */
export function resetBackendProvider(): void {
  _instance = null;
}
