# PHASE 1 - DATA FOUNDATION & SUPABASE SETUP

## Global Objective

Build a system where:

- Users can swap shifts in under 30 seconds
- No WhatsApp/manual coordination is required
- Constraints are enforced automatically
- Calendar sync is incremental and idempotent
- Users can request leave directly from the system
- New users can recover schedules via shared uploads (with consent)

## Core Architecture

Frontend:

- Next.js (App Router, TypeScript, Tailwind)

Backend:

- Supabase:
  - PostgreSQL
  - Auth (Google OAuth)
  - Edge Functions (Deno)
  - Realtime
  - Storage

## OpenAPI Contract (Source of Truth)

[USE EXACT SPEC PROVIDED - DO NOT MODIFY]

## Tables

- users
- shifts
- swap_availability
- swap_requests
- constraint_logs
- leave_requests
- schedule_uploads
- schedule_access_requests

## Requirements

- users:
  - employee_code (required)
- shifts:
  - google_event_id
- schedule_uploads:
  - file_hash
  - consent_to_share

## RLS

- Users access only their own shifts
- Shared schedule logic must not expose full datasets

## Indexes

- shifts(date, user_id)
- swap_availability(shift_id, is_open)
- schedule_uploads(file_hash)

## Analyzer - Phase 1

Validate:

- Schema complete and normalized
- RLS enforced correctly
- Indexes present
- Auth working

If any condition fails:
-> Fix before moving to Phase 2
