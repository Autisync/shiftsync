# PHASE 2 - EXCEL PARSER + SHARED SCHEDULE RECOVERY

## Objective

Deliver upload/import and shared schedule recovery through clean feature/service boundaries with strict consent and privacy controls.

## Scope

### Parser and Upload Boundary

- Keep existing parser logic but move under feature/service boundary.
- Implement upload flow backed by Supabase:
  - hash file client-side
  - persist upload metadata in schedule_uploads
- Add stubs/placeholders for edge processing where needed.

### User Matching Service

- Build service to map shifts to signed-in user by:
  - employee_code
  - fallback normalized full_name

### Shared Recovery

- Build consent-driven shared schedule recovery UI.
- Enforce:
  - uploader consent
  - receiver consent
- Never expose full shared schedule to unauthorized users.

### Architecture Compliance

- Upload and recovery must call provider/services, not ad-hoc table calls in UI.
- Keep production-safe behavior using VITE_ENABLE_SHARED_RECOVERY.

## Adjustments
- change so that users are able to edit name, employee id and all personal identifier upon first login

## Analyzer - Phase 2

Validate:

- Excel parsing and import path works
- Upload metadata persists with file hash and consent flags
- Shift deduplication works
- Shared schedule detection works (matching hashes with consent)
- Dual consent enforced
- Only relevant user shifts are recovered

If any condition fails:
-> Fix before moving to Phase 3
