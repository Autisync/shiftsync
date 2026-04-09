# Phase 2 Gate Validation Checklist

Purpose: sign off Phase 2 for ShiftSync upload/import and shared schedule recovery with strict consent and provider/service boundaries.

## A. Parser and Upload Boundary

- [x] Excel parsing and import path is implemented and functional
- [x] Upload flow persists metadata in `schedule_uploads`
- [x] File hash is generated client-side before persistence
- [x] Edge processing path is available and callable

## B. User Matching Service

- [x] Shift-user matching supports `employee_code`
- [x] Fallback matching supports normalized `full_name`
- [x] Parsed payload includes employee identifiers used for recovery

## C. Shared Recovery and Consent

- [x] Shared recovery UI exists for consent-driven recovery
- [x] Uploader consent is required
- [x] Receiver consent is required and checked
- [x] Full shared schedules are not exposed to unauthorized users
- [x] Recovery inserts only receiver-relevant shifts

## D. Architecture Compliance

- [x] Upload and recovery flows use provider/services
- [x] No ad-hoc raw table calls in Phase 2 UI additions
- [x] Shared recovery behavior is gated by `VITE_ENABLE_SHARED_RECOVERY`

## E. Phase Adjustment

- [x] First-login profile completion allows editing personal identifiers
- [x] Name, employee ID, and email update flow implemented

## F. Safety and Quality

- [x] `node supabase/functions/phase2-analyzer.js` passes
- [x] `npm run build` passes
- [x] No regression found in current live flow baseline

## Sign Off

- [x] Section A complete
- [x] Section B complete
- [x] Section C complete
- [x] Section D complete
- [x] Section E complete
- [x] Section F complete

Phase 2 is approved only when all checks are complete.
