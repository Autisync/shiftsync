# PHASE 3 - CALENDAR SYNC ENGINE

## Edge Function: calendar-sync

- Fetch DB shifts
- Fetch Google events
- Diff:
  - create
  - update
  - delete (optional)

- Store google_event_id
- Ensure idempotency

## Analyzer - Phase 3

Validate:

- No duplicate events
- Updates do not recreate events
- Sync is idempotent

## Adjustments
- change so that users are able to edit name, employee id and all personal identifier upon first login
- 

If any condition fails:
-> Fix before moving to Phase 4
