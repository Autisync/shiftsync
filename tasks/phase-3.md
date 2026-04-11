# PHASE 3 - CALENDAR SYNC ENGINE ABSTRACTION

## Objective

Refactor calendar sync into a service abstraction while keeping current working browser-based Google sync behavior intact.

## Scope

### Service Abstraction

- Define CalendarSyncService contract.
- Implement adapter for current client-side Google sync.
- Add future server-side sync adapter stub.

### Sync Logic Structure

- Implement idempotent sync flow with diff strategy:
  - create
  - update
  - delete (safe and optional)
- Persist and reuse google_event_id.
- Prevent duplicate event creation.

### Safety

- Do not remove current working behavior.
- Isolate new sync paths behind config/adapter selection.

## Analyzer - Phase 3

Validate:

- No duplicate events for idempotent re-sync
- Updates do not recreate unchanged events
- google_event_id mapping is stable
- Adapter selection works without breaking current flow

If any condition fails:
-> Fix before moving to Phase 4

## Current Status (Updated)

- Phase 3 sync abstraction is implemented and active through the backend provider calendar service path.
- Diff-based reconciliation (create/update/delete/noop) is implemented and exercised in tests.
- Stable event linkage is implemented with `shift_uid`, `sync_shift_key`, and `google_event_id` persistence.

## Hardening Implemented In Phase 3

- Missing-event recovery on noop: recreates tracked events that were manually deleted in Google.
- Missing-event recovery on update (404/410): recreates and rebinds instead of failing sync.
- Upload conflict resilience:
  - fallback upsert path for legacy unique constraints
  - sequential reconciliation fallback for `shifts_user_shift_uid_key` conflicts
  - dedupe guard for duplicate rows in the same upload payload
- Tracking conflict resilience for `calendar_sync_records` unique-key conflicts (external event and sync key re-key paths).

## Analyzer Results (Pre-Phase-4 Gate)

Validation checklist:

- No duplicate events for idempotent re-sync: PASS
- Updates do not recreate unchanged events: PASS
- `google_event_id` mapping remains stable across re-sync/recovery: PASS
- Adapter selection works without breaking current flow: PASS

Evidence:

- `tests/calendar/phase3-smoke.test.ts`
- `tests/calendar/calendarDiff.test.ts`
- `tests/calendar/reconciliation-anomaly-logs.test.ts`
- `tests/calendar/shift-uid-normalization.test.ts`
- Latest targeted execution: 4 test files passed, 19 tests passed.

## Gate

- Do not move to Phase 4 yet.
- Remain in Phase 3 until final manual QA run confirms end-to-end behavior after a second updated schedule upload (no duplicates, expected create/update/delete only).
