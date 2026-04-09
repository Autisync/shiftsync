# PHASE 2 - EXCEL PARSER + SHARED SCHEDULE RECOVERY

## Edge Function: parse-excel

- Parse Excel
- Map users via employee_code or normalized name
- Insert shifts
- Deduplicate

## Extension - Shared Schedule Recovery

1. Store uploads:
   - hash file
   - uploader_user_id
   - consent_to_share
2. Detect:
   - identical hashes
   - > = 2-3 uploads with consent
3. Mark as:
   -> verified shared schedule
4. Notify users without schedules

## Edge Function: process-shared-schedule

Flow:

- user consents
- system maps shifts (employee_code or name)
- insert only user's shifts
- trigger calendar sync

Constraints:

- NEVER expose full schedule
- MUST require:
  - uploader consent
  - receiver consent

## Analyzer - Phase 2

Validate:

- Excel parsing works
- No duplicate shifts
- Shared schedule detection works
- Minimum consent enforced
- Only relevant shifts extracted

If any condition fails:
-> Fix before moving to Phase 3
