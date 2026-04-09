/**
 * src/config/env.ts
 *
 * Typed, validated access to Vite environment variables.
 * Import `getConfig()` instead of using `import.meta.env` directly.
 */

export type AppEnv = "local" | "demo" | "staging" | "production";
export type BackendMode = "supabase" | "api";

export interface AppConfig {
  appEnv: AppEnv;
  backendMode: BackendMode;
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
  googleClientId: string;
  publicAppUrl: string;
  features: {
    enableSwaps: boolean;
    enableLeave: boolean;
    enableSharedRecovery: boolean;
    enableRealtime: boolean;
  };
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    console.warn(`[ShiftSync] Missing required env var: ${key}`);
  }
  return value ?? "";
}

function parseAppEnv(raw: string | undefined): AppEnv {
  const valid: AppEnv[] = ["local", "demo", "staging", "production"];
  if (raw && valid.includes(raw as AppEnv)) return raw as AppEnv;
  return "local";
}

function parseBackendMode(raw: string | undefined): BackendMode {
  if (raw === "api") return "api";
  return "supabase";
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  const appEnv = parseAppEnv(import.meta.env.VITE_APP_ENV);
  const backendMode = parseBackendMode(import.meta.env.VITE_BACKEND_MODE);

  if (backendMode === "supabase") {
    requireEnv("VITE_SUPABASE_URL");
    requireEnv("VITE_SUPABASE_ANON_KEY");
  }

  if (backendMode === "api") {
    requireEnv("VITE_API_BASE_URL");
  }

  _config = {
    appEnv,
    backendMode,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
    publicAppUrl: import.meta.env.VITE_PUBLIC_APP_URL ?? "",
    features: {
      enableSwaps: bool(import.meta.env.VITE_ENABLE_SWAPS),
      enableLeave: bool(import.meta.env.VITE_ENABLE_LEAVE),
      enableSharedRecovery: bool(import.meta.env.VITE_ENABLE_SHARED_RECOVERY),
      enableRealtime: bool(import.meta.env.VITE_ENABLE_REALTIME),
    },
  };

  return _config;
}

/** Convenience: true when running in the local dev environment. */
export const isLocal = () => getConfig().appEnv === "local";

/** Convenience: true when NOT in production (safe to enable dev tooling). */
export const isNotProduction = () => getConfig().appEnv !== "production";
