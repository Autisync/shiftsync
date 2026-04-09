# Phase 1 Gate Validation Checklist

> **Purpose:** Formal sign-off that Phase 1 ("Data Foundation & Supabase Setup") is complete and ready for Phase 2

---

## Section A: Static Code Validation

**Status:** ✅ PASS (verified at conversation end)

These checks confirm schema, indexes, RLS, and build health without live Supabase:

- [ ] **Schema Complete**
  - Command: `grep -c "CREATE TABLE" supabase/migrations/20260408_phase1_data_foundation.sql`
  - Expected: 8 tables (users, shifts, swap_availability, swap_requests, constraint_logs, leave_requests, schedule_uploads, schedule_access_requests)
  - Result: ✅ 8 found

- [ ] **Required Indexes Present**
  - Command: `grep "CREATE INDEX" supabase/migrations/20260408_phase1_data_foundation.sql`
  - Expected: shifts(date, user_id), swap_availability(shift_id, is_open), schedule_uploads(file_hash)
  - Result: ✅ All 3 found

- [ ] **RLS Enabled & Forced**
  - Command: `grep -E "ALTER TABLE.*ENABLE.*ROW LEVEL SECURITY|ALTER TABLE.*FORCE ROW LEVEL SECURITY" supabase/migrations/20260408_phase1_data_foundation.sql | wc -l`
  - Expected: 16 statements (2 per table × 8 tables)
  - Result: ✅ 16 found

- [ ] **RLS Policies Defined**
  - Command: `grep -c "CREATE POLICY" supabase/migrations/20260408_phase1_data_foundation.sql`
  - Expected: 22 policies covering all access patterns
  - Result: ✅ 22 found

- [ ] **Auth Config Present**
  - File: `supabase/config.toml`
  - Expected: Google OAuth provider configured
  - Result: ✅ Found

- [ ] **Env Vars Template Complete**
  - File: `.env.example`
  - Expected: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_CLIENT_ID
  - Result: ✅ All 3 present

- [ ] **Build Passes**
  - Command: `npm run build`
  - Expected: Zero TypeScript errors, Vite succeeds
  - Result: ✅ Built in 4.96s, 2333 modules

---

## Section B: Live Supabase Integration

**Status:** ⏳ PENDING (requires user action + CLI)

These checks confirm schema and RLS are actually deployed to your Supabase project:

### B1: Authentication & Linking

- [ ] **Supabase CLI Installed**
  ```bash
  supabase --version
  ```
- [ ] **Logged In to Supabase**

  ```bash
  supabase login
  # Opens browser for GitHub OAuth
  ```

- [ ] **Project Linked**
  ```bash
  supabase link --project-ref fxevgmjmlervpmmghozy
  # Links local repo to your Supabase project
  ```

### B2: Migration Deployed

- [ ] **Migration Pushed**
  ```bash
  supabase db push
  # Uploads Phase 1 migration to remote DB
  ```

### B3: Live DB Validation

- [ ] **Tables Created**

  ```bash
  psql $SUPABASE_DB_URL -c "\dt public.*"
  # Expected: 8 public tables
  ```

- [ ] **RLS Enabled on All Tables**

  ```bash
  psql $SUPABASE_DB_URL -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=true"
  # Expected: 8 tables
  ```

- [ ] **Indexes Created**

  ```bash
  psql $SUPABASE_DB_URL -c "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('shifts', 'swap_availability', 'schedule_uploads')"
  # Expected: At least 3 indexes
  ```

- [ ] **Enum Types Created**
  ```bash
  psql $SUPABASE_DB_URL -c "SELECT enum_range(NULL::swap_request_status)"
  # Expected: (pending,accepted,rejected,submitted_to_hr,approved)
  ```

---

## Section C: Runtime Auth Flow

**Status:** ⏳ PENDING (requires testing)

These checks confirm authentication and session persistence work end-to-end:

### C1: Environment Setup

- [ ] **`.env.local` Populated**
  ```
  VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
  VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
  VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
  ```

### C2: Local Development

- [ ] **Dev Server Starts**

  ```bash
  npm run dev
  # Server runs on http://localhost:5173
  ```

- [ ] **Google OAuth Login Works**
  - Click login button
  - Redirected to Google consent screen
  - Approve and redirected back to dashboard
  - No console errors

- [ ] **Session Persists Across Refresh**
  - After login, press F5 (refresh)
  - User remains logged in (no redirect to login)
  - Session data loaded from Supabase (check Network tab → check for session restore call)

- [ ] **User Auto-Created**
  - After first login, check Supabase dashboard → Authentication
  - New user appears with Google provider
  - Check public.users table → new row with matching user_id

- [ ] **Sign-Out Works**
  - Click logout button
  - Session cleared
  - Redirected to login screen
  - localStorage cleared

---

## Section D: Sign-Off

**Approval Criteria:** All sections A, B, C must have checkboxes marked ✅

> If **any** checkbox is ❌, STOP and fix before proceeding to Phase 2.

- [ ] Section A: Static Validation - PASS
- [ ] Section B: Live Integration - PASS
- [ ] Section C: Runtime Auth - PASS

**Phase 1 Approved By:** ******\_\_\_\_******  
**Date:** ******\_\_\_\_******  
**Notes:**

```
[Use this space to document any issues discovered and how they were resolved]
```

---

## Ready for Phase 2?

Once all checkboxes are ✅, Phase 1 is complete.

**Phase 2** will build on this foundation:

- Excel parsing with uploads (file_hash + consent_to_share)
- Shared schedule detection (2-3 identical hashes)
- Dual-consent enforcement (uploader + receiver)
- Edge Functions for parse-excel and process-shared-schedule

**Command to Start Phase 2:**

```bash
# Request Agent execution
"execute phase-2.md"
```
