#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const checks = [];

function addCheck(name, fn) {
  checks.push({ name, fn });
}

addCheck("browser sync adapter exists with diffing logic", () => {
  const content = read(
    "src/features/calendar/services/browser-calendar-sync.adapter.ts",
  );
  assert(
    content.includes("findMatchingEvent"),
    "Exact-match diff helper missing",
  );
  assert(
    content.includes("summary.noop"),
    "Noop unchanged events not tracked",
  );
  assert(content.includes("createEvent"), "Create path missing");
  assert(content.includes("updateEvent"), "Update path missing");
  assert(content.includes("deleteEvent"), "Delete path missing");
});

addCheck(
  "home sync uses provider calendar service instead of raw Google loop",
  () => {
    const content = read("src/components/home.tsx");
    assert(
      content.includes("backend.calendar.runSync"),
      "Home not wired to calendar service",
    );
    assert(
      !content.includes("new GoogleCalendarService(accessToken)"),
      "Raw GoogleCalendarService still used directly in Home sync",
    );
  },
);

addCheck("calendar service contract supports preview sync adapter", () => {
  const content = read("src/services/backend/types.ts");
  assert(
    content.includes("runSync"),
    "runSync contract missing",
  );
  assert(
    content.includes("CalendarPreviewSyncResult"),
    "Preview sync result type missing",
  );
});

addCheck("supabase provider delegates calendar sync through Phase 3 service", () => {
  const content = read("src/services/backend/supabase-provider.ts");
  assert(
    content.includes("new Phase3CalendarSync"),
    "Phase 3 sync service not used in Supabase provider",
  );
  assert(
    content.includes("calendar_sync_records") || content.includes("makeLocalCalendarRepository"),
    "Tracking repository path missing",
  );
  assert(
    content.includes("removeStaleEvents: options.removeStaleEvents ?? true"),
    "runSync is not configured to delete stale calendar events",
  );
});

addCheck("diff plan bridges missing record with existing event id", () => {
  const content = read("src/features/calendar/services/calendarDiff.ts");
  assert(
    content.includes("Event ID exists but tracking record is missing"),
    "Bridge update reason missing in diff engine",
  );
});

addCheck("sync key is stable and does not depend on volatile shift id", () => {
  const content = read("src/features/calendar/utils/eventFingerprint.ts");
  assert(
    !content.includes("::shift:"),
    "sync key still depends on shift.id",
  );
  assert(
    content.includes("uid:"),
    "sync key is not shift_uid-based",
  );
});

addCheck("shift_uid utility exists and includes required deterministic fields", () => {
  const content = read("src/shared/utils/shift-uid.ts");
  assert(content.includes("userId"), "shift_uid missing user_id component");
  assert(content.includes("startTime"), "shift_uid missing start_time component");
  assert(content.includes("endTime"), "shift_uid missing end_time component");
  assert(content.includes("role"), "shift_uid missing role component");
});

addCheck("upload persistence upserts shifts by shift_uid", () => {
  const content = read("src/features/uploads/services/schedule-upload.service.ts");
  assert(content.includes("buildShiftUidFromShift"), "shift_uid generation not used in upload persistence");
  assert(content.includes(".upsert(rows"), "shift upsert path missing");
  assert(content.includes("onConflict: \"user_id,shift_uid\""), "upsert conflict target is not user_id + shift_uid");
});

addCheck("shift lifecycle tracking marks stale rows as deleted", () => {
  const content = read("src/features/uploads/services/schedule-upload.service.ts");
  assert(content.includes("upload_batch_id"), "upload_batch_id lifecycle field missing");
  assert(content.includes("last_seen_at"), "last_seen_at lifecycle field missing");
  assert(content.includes("status: \"deleted\""), "stale shifts are not soft-deleted");
});

addCheck("calendar sync logs create/update/delete/skip actions", () => {
  const content = read("src/features/calendar/services/calendarSyncService.ts");
  assert(content.includes("CREATE event for shift_uid="), "CREATE log missing");
  assert(content.includes("UPDATE event for shift_uid="), "UPDATE log missing");
  assert(content.includes("DELETE event for shift_uid="), "DELETE log missing");
  assert(content.includes("SKIP unchanged shift_uid="), "SKIP log missing");
});

addCheck("migration includes shift_uid + lifecycle schema", () => {
  const content = read("supabase/migrations/20260410090400_phase3_shift_uid_lifecycle.sql");
  assert(content.includes("add column if not exists shift_uid"), "shift_uid column migration missing");
  assert(content.includes("add column if not exists upload_batch_id"), "upload_batch_id migration missing");
  assert(content.includes("add column if not exists last_seen_at"), "last_seen_at migration missing");
  assert(content.includes("add column if not exists status"), "status migration missing");
});

addCheck("future server-side calendar adapter stub exists", () => {
  const content = read(
    "src/features/calendar/services/server-calendar-sync.adapter.ts",
  );
  assert(
    content.includes("not implemented") ||
      content.includes("not implemented yet") ||
      content.includes("not implemented yet"),
    "Server-side stub missing",
  );
});

async function run() {
  console.log("\nPhase 3 Analyzer\n");
  let passed = 0;

  for (const check of checks) {
    try {
      await check.fn();
      passed += 1;
      console.log(`✓ ${check.name}`);
    } catch (error) {
      console.log(`✗ ${check.name}: ${error.message}`);
    }
  }

  console.log(`\nResult: ${passed}/${checks.length} checks passed.`);
  if (passed !== checks.length) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
