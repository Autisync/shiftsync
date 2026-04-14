-- Leave Requests Lifecycle v2
-- Extends leave_requests with HR email workflow, soft_declined status,
-- approved-date override, calendar sync tracking, and expiry function.
-- All changes are idempotent.

-- ── 1. Extend leave_request_status enum ──────────────────────────────────

do $$
begin
  alter type public.leave_request_status add value if not exists 'draft';
exception
  when others then null;
end $$;

do $$
begin
  alter type public.leave_request_status add value if not exists 'soft_declined';
exception
  when others then null;
end $$;

-- ── 2. Add new columns to leave_requests ─────────────────────────────────

alter table public.leave_requests
  add column if not exists sent_to_hr_at          timestamptz,
  add column if not exists decision_due_at          timestamptz,
  add column if not exists approved_start_date      date,
  add column if not exists approved_end_date        date,
  add column if not exists approved_notes           text,
  add column if not exists hr_response_notes        text,
  add column if not exists soft_declined_at         timestamptz,
  add column if not exists calendar_applied_at      timestamptz,
  add column if not exists google_event_id          text,
  add column if not exists leave_uid                text,
  add column if not exists last_synced_calendar_id  text;

-- rename start_date/end_date columns to requested_* if they are still named
-- the old way — guard so this only runs once
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leave_requests'
      and column_name  = 'start_date'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leave_requests'
      and column_name  = 'requested_start_date'
  ) then
    alter table public.leave_requests rename column start_date to requested_start_date;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leave_requests'
      and column_name  = 'end_date'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leave_requests'
      and column_name  = 'requested_end_date'
  ) then
    alter table public.leave_requests rename column end_date to requested_end_date;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leave_requests'
      and column_name  = 'notes'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leave_requests'
      and column_name  = 'requested_notes'
  ) then
    alter table public.leave_requests rename column notes to requested_notes;
  end if;
end $$;

-- ── 3. Update the check constraint to reflect new column names and statuses

alter table public.leave_requests
  drop constraint if exists leave_requests_end_date_check;

alter table public.leave_requests
  drop constraint if exists leave_requests_check;

alter table public.leave_requests
  add constraint leave_requests_date_order_check
    check (requested_end_date >= requested_start_date);

-- NOTE:
-- We intentionally do not set status default to 'draft' in this migration.
-- PostgreSQL disallows using a freshly added enum value in the same transaction
-- ("unsafe use of new value"). The application already writes 'draft'
-- explicitly on create, so behavior remains correct.

-- ── 4. Unique index on leave_uid (non-null) ───────────────────────────────

create unique index if not exists leave_requests_leave_uid_key
  on public.leave_requests(leave_uid)
  where leave_uid is not null;

create unique index if not exists leave_requests_google_event_id_key
  on public.leave_requests(google_event_id)
  where google_event_id is not null;

-- ── 5. Operational indexes ────────────────────────────────────────────────

create index if not exists leave_requests_pending_expired_idx
  on public.leave_requests(sent_to_hr_at)
  where status = 'pending';

-- ── 6. Soft-decline expiry function ──────────────────────────────────────

create or replace function public.expire_stale_leave_requests()
returns integer
language plpgsql
security definer
as $$
declare
  rows_updated integer;
begin
  update public.leave_requests
  set
    status           = 'soft_declined',
    soft_declined_at = timezone('utc'::text, now()),
    updated_at       = timezone('utc'::text, now())
  where
    status       = 'pending'
    and sent_to_hr_at is not null
    and sent_to_hr_at < timezone('utc'::text, now()) - interval '30 days';

  get diagnostics rows_updated = row_count;
  return rows_updated;
end;
$$;

comment on function public.expire_stale_leave_requests() is
  'Soft-declines leave requests that have been pending for more than 30 days.
   Called by the expire-leave-requests Edge Function on a schedule.
   Returns the number of rows updated.';

-- ── 7. RLS — allow users to read and update their own requests ────────────

drop policy if exists leave_requests_select_own on public.leave_requests;
create policy leave_requests_select_own
  on public.leave_requests for select
  using (auth.uid() = user_id);

drop policy if exists leave_requests_insert_own on public.leave_requests;
create policy leave_requests_insert_own
  on public.leave_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists leave_requests_update_own on public.leave_requests;
create policy leave_requests_update_own
  on public.leave_requests for update
  using (auth.uid() = user_id);
