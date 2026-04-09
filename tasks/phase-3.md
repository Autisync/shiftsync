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
