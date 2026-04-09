# PHASE 1 - FOUNDATION: DATA, ENV, PROVIDER BASELINE

## Objective

Stabilize architecture for Supabase-first today and custom backend tomorrow, without breaking current live behavior.

## Scope

### Architecture Baseline

- Keep React + Vite + TypeScript as-is.
- Introduce domain-oriented folders:
  - src/app
  - src/features/*
  - src/shared
  - src/services
  - src/config
  - src/types

### Environment and Config

- Create and wire:
  - .env.example
  - .env.local.example
  - .env.demo.example
  - .env.production.example
- Implement typed config helper:
  - src/config/env.ts
- Validate required vars:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
  - VITE_BACKEND_MODE
  - VITE_API_BASE_URL
  - VITE_APP_ENV
  - VITE_GOOGLE_CLIENT_ID
  - VITE_PUBLIC_APP_URL

### Backend Provider Layer

- Create:
  - src/services/backend/types.ts
  - src/services/backend/backend-provider.ts
  - src/services/backend/supabase-provider.ts
  - src/services/backend/http-provider.ts (stub)
- Define interfaces:
  - AuthService
  - ShiftService
  - UploadService
  - SwapService
  - LeaveService
  - CalendarSyncService
  - NotificationService
- Provider selection via env:
  - VITE_BACKEND_MODE=supabase|api

### Data Foundation Completion

- Keep existing migration as source of truth.
- Ensure TypeScript DB types are complete and consistent.
- Add repository/service methods for:
  - users
  - shifts
  - swap_availability
  - swap_requests
  - leave_requests
  - schedule_uploads
  - schedule_access_requests

### Auth and Route Access

- Add auth session bootstrap.
- Load current profile from public.users.
- Add authenticated route guards.
- Add loading/error/empty states for core app views.

## Constraints

- No live production behavior changes unless behind env/flags.
- No business logic in page-level components.
- No direct scattered Supabase access in UI once provider baseline is in place.

## Analyzer - Phase 1

Validate:

- Environment config validation works
- Provider selection works (supabase/api modes)
- Auth bootstrap and profile loading work
- Repository baseline methods exist for all required entities
- Build passes with no regressions

If any condition fails:
-> Fix before moving to Phase 2
