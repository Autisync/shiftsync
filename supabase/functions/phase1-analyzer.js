#!/usr/bin/env node
/**
 * supabase/functions/phase1-analyzer.js
 *
 * Phase 1 structural integrity analyzer.
 * Validates that all Phase 1 architecture deliverables exist and are wired.
 * Run: node supabase/functions/phase1-analyzer.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function readFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const checks = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      checks.push({ name, status: "PASS" });
    } else {
      checks.push({
        name,
        status: "FAIL",
        reason: result || "Condition not met",
      });
    }
  } catch (e) {
    checks.push({ name, status: "FAIL", reason: e.message });
  }
}

// ── A: Environment and Config ────────────────────────────────────────────

check("A1: .env.example exists with all required vars", () => {
  const content = readFile(".env.example");
  if (!content) return "Missing .env.example";
  const required = [
    "VITE_APP_ENV",
    "VITE_BACKEND_MODE",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_API_BASE_URL",
    "VITE_GOOGLE_CLIENT_ID",
    "VITE_PUBLIC_APP_URL",
    "VITE_ENABLE_SWAPS",
    "VITE_ENABLE_LEAVE",
    "VITE_ENABLE_SHARED_RECOVERY",
    "VITE_ENABLE_REALTIME",
  ];
  const missing = required.filter((v) => !content.includes(v));
  if (missing.length > 0) return `Missing vars: ${missing.join(", ")}`;
  return true;
});

check(
  "A2: .env.local.example, .env.demo.example, .env.production.example exist",
  () => {
    const files = [
      ".env.local.example",
      ".env.demo.example",
      ".env.production.example",
    ];
    const missing = files.filter((f) => !fileExists(f));
    if (missing.length > 0) return `Missing: ${missing.join(", ")}`;
    return true;
  },
);

check("A3: src/config/env.ts exists and validates env vars", () => {
  const content = readFile("src/config/env.ts");
  if (!content) return "Missing src/config/env.ts";
  if (!content.includes("getConfig")) return "Missing getConfig function";
  if (!content.includes("VITE_BACKEND_MODE"))
    return "Missing VITE_BACKEND_MODE handling";
  if (!content.includes("VITE_APP_ENV")) return "Missing VITE_APP_ENV handling";
  if (!content.includes("features")) return "Missing feature flags in config";
  return true;
});

// ── B: Backend Abstraction Layer ─────────────────────────────────────────

check("B1: src/services/backend/types.ts defines service interfaces", () => {
  const content = readFile("src/services/backend/types.ts");
  if (!content) return "Missing types.ts";
  const required = [
    "AuthService",
    "UserService",
    "ShiftService",
    "UploadService",
    "SwapService",
    "LeaveService",
    "CalendarSyncService",
    "NotificationService",
    "BackendServices",
  ];
  const missing = required.filter((s) => !content.includes(s));
  if (missing.length > 0) return `Missing interfaces: ${missing.join(", ")}`;
  return true;
});

check(
  "B2: src/services/backend/backend-provider.ts provides getBackend()",
  () => {
    const content = readFile("src/services/backend/backend-provider.ts");
    if (!content) return "Missing backend-provider.ts";
    if (!content.includes("getBackend")) return "Missing getBackend export";
    if (!content.includes("SupabaseProvider"))
      return "Missing SupabaseProvider reference";
    if (!content.includes("HttpProvider"))
      return "Missing HttpProvider reference";
    if (!content.includes("backendMode")) return "Missing backendMode check";
    return true;
  },
);

check(
  "B3: src/services/backend/supabase-provider.ts implements BackendServices",
  () => {
    const content = readFile("src/services/backend/supabase-provider.ts");
    if (!content) return "Missing supabase-provider.ts";
    if (!content.includes("SupabaseProvider"))
      return "Missing SupabaseProvider class";
    if (!content.includes("implements BackendServices"))
      return "Missing BackendServices implementation";
    const required = [
      "auth",
      "users",
      "shifts",
      "uploads",
      "swaps",
      "leave",
      "calendar",
      "notifications",
    ];
    const missing = required.filter((s) => !content.includes(s));
    if (missing.length > 0) return `Missing services: ${missing.join(", ")}`;
    return true;
  },
);

check("B4: src/services/backend/http-provider.ts stubbed for migration", () => {
  const content = readFile("src/services/backend/http-provider.ts");
  if (!content) return "Missing http-provider.ts";
  if (!content.includes("HttpProvider")) return "Missing HttpProvider class";
  if (!content.includes("implements BackendServices"))
    return "Missing BackendServices implementation";
  if (
    !content.includes("Not yet implemented") &&
    !content.includes("not yet implemented") &&
    !content.includes("notImplemented")
  ) {
    return "Missing notImplemented stub handling";
  }
  return true;
});

// ── C: Domain Types and Mappers ───────────────────────────────────────────

check("C1: src/types/domain.ts defines backend-neutral domain models", () => {
  const content = readFile("src/types/domain.ts");
  if (!content) return "Missing src/types/domain.ts";
  const required = [
    "UserProfile",
    "Shift",
    "SwapAvailability",
    "SwapRequest",
    "LeaveRequest",
    "ScheduleUpload",
    "ScheduleAccessRequest",
    "AuthSession",
  ];
  const missing = required.filter((s) => !content.includes(s));
  if (missing.length > 0) return `Missing types: ${missing.join(", ")}`;
  return true;
});

check("C2: Domain mappers exist for all entities", () => {
  const mappers = [
    "src/shared/mappers/user.mapper.ts",
    "src/shared/mappers/shift.mapper.ts",
    "src/shared/mappers/swap.mapper.ts",
    "src/shared/mappers/leave.mapper.ts",
    "src/shared/mappers/upload.mapper.ts",
  ];
  const missing = mappers.filter((f) => !fileExists(f));
  if (missing.length > 0) return `Missing mappers: ${missing.join(", ")}`;
  return true;
});

// ── D: Feature Flags ──────────────────────────────────────────────────────

check("D1: src/shared/utils/featureFlags.ts exports flag helpers", () => {
  const content = readFile("src/shared/utils/featureFlags.ts");
  if (!content) return "Missing featureFlags.ts";
  const required = [
    "isSwapsEnabled",
    "isLeaveEnabled",
    "isSharedRecoveryEnabled",
    "isRealtimeEnabled",
  ];
  const missing = required.filter((s) => !content.includes(s));
  if (missing.length > 0) return `Missing helpers: ${missing.join(", ")}`;
  return true;
});

// ── E: Auth Bootstrap and Route Guard ─────────────────────────────────────

check("E1: src/hooks/use-auth.ts provides auth session bootstrap", () => {
  const content = readFile("src/hooks/use-auth.ts");
  if (!content) return "Missing use-auth.ts";
  if (!content.includes("useAuth")) return "Missing useAuth export";
  if (!content.includes("getBackend")) return "Not wired to backend provider";
  if (!content.includes("getSession")) return "Missing session restoration";
  if (!content.includes("getUserProfile")) return "Missing profile loading";
  return true;
});

check("E2: src/components/auth/RequireAuth.tsx exists as route guard", () => {
  const content = readFile("src/components/auth/RequireAuth.tsx");
  if (!content) return "Missing RequireAuth.tsx";
  if (!content.includes("RequireAuth")) return "Missing RequireAuth export";
  if (!content.includes("Navigate"))
    return "Missing redirect on unauthenticated";
  if (!content.includes("useAuth")) return "Not using useAuth hook";
  return true;
});

// ── Print results ─────────────────────────────────────────────────────────

console.log("\n=== Phase 1 Analyzer ===\n");

let passed = 0;
let failed = 0;

for (const c of checks) {
  if (c.status === "PASS") {
    console.log(`  ✓ ${c.name}`);
    passed++;
  } else {
    console.log(`  ✗ ${c.name}`);
    console.log(`      Reason: ${c.reason}`);
    failed++;
  }
}

console.log(`\n${passed}/${checks.length} checks passed\n`);

if (failed > 0) {
  console.error(
    `Phase 1 INCOMPLETE: ${failed} check(s) failed. Fix before moving to Phase 2.\n`,
  );
  process.exit(1);
} else {
  console.log("Phase 1 COMPLETE: All checks passed.\n");
}
