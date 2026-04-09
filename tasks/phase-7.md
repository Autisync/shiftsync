# PHASE 7 - HR AUTOMATION (SWAPS + LEAVE)

## Swap Email

Edge Function: send-to-hr

- structured email
- triggered after valid swap

## Extension - Leave Requests

### Table: leave_requests

Fields:

- user_id
- start_date
- end_date
- type
- status

### Edge Function: request-leave

- create request
- validate conflicts

### Edge Function: process-leave

- approve/reject
- update shifts
- trigger calendar sync

## Analyzer - Phase 7

Validate:

- Emails sent correctly
- Leave requests function correctly
- Calendar updates reflect leave
- No conflicting shifts remain

If any condition fails:
-> Fix before moving to Phase 8
