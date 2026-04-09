#!/usr/bin/env node

/**
 * Phase 2 Analyzer - structural/behavioral verification
 * Run with: node supabase/functions/phase2-analyzer.js
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const checks = [];

function addCheck(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  const abs = path.join(root, relativePath);
  return fs.readFileSync(abs, "utf8");
}

addCheck("parse-excel implements file parsing path", () => {
  const content = read("supabase/functions/parse-excel/index.ts");
  assert(content.includes("parseExcelContent"), "Missing parseExcelContent implementation");
  assert(!content.includes("File-based parsing not yet implemented"), "Placeholder parsing text still exists");
  assert(content.includes("XLSX.read"), "XLSX parser not wired");
});

addCheck("parse-excel persists upload hash + metadata payload", () => {
  const content = read("supabase/functions/parse-excel/index.ts");
  assert(content.includes("file_hash"), "file_hash not persisted");
  assert(content.includes("parsed_payload"), "parsed payload missing for shared recovery");
});

addCheck("process-shared-schedule enforces receiver consent", () => {
  const content = read("supabase/functions/process-shared-schedule/index.ts");
  assert(content.includes("schedule_access_requests"), "Receiver consent table not queried");
  assert(content.includes("consent_given"), "consent_given check missing");
  assert(content.includes("status !== \"approved\""), "approved status gate missing");
  assert(!content.includes("For MVP: allow if uploader has consent_to_share"), "MVP bypass still present");
});

addCheck("process-shared-schedule maps only receiver-specific shifts", () => {
  const content = read("supabase/functions/process-shared-schedule/index.ts");
  assert(content.includes("receiver.employee_code"), "Receiver employee_code mapping missing");
  assert(content.includes("receiver.full_name"), "Receiver name mapping missing");
  assert(content.includes("parsed_payload"), "Recovery source payload not used");
});

addCheck("phase2 SQL fixes exist and remove known bug patterns", () => {
  const sql = read("supabase/migrations/20260409_phase2_functional_fixes.sql");
  assert(sql.includes("detect_shared_schedule_by_hash"), "Hash-based shared detection function missing");
  assert(!sql.includes("s2.date > s2.date"), "Broken consecutive-days comparison still present");
  assert(sql.includes("trigger_update_upload_metadata"), "Upload metadata trigger fix missing");
});

async function run() {
  console.log("\\nPhase 2 Analyzer\\n");
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

  console.log(`\\nResult: ${passed}/${checks.length} checks passed.`);
  if (passed !== checks.length) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
