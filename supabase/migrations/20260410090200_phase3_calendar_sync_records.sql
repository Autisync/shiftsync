-- Phase 3: calendar sync tracking records

create table if not exists public.calendar_sync_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  provider text not null check (provider in ('google')),
  calendar_id text not null,
  sync_shift_key text not null,
  external_event_id text not null,
  shift_fingerprint text not null,
  synced_start timestamptz not null,
  synced_end timestamptz not null,
  synced_title text not null,
  synced_description text,
  synced_location text,
  sync_status text not null default 'ok' check (sync_status in ('ok','failed')),
  last_error text,
  last_synced_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists calendar_sync_records_unique_shift_key
  on public.calendar_sync_records(user_id, provider, calendar_id, sync_shift_key);

create unique index if not exists calendar_sync_records_unique_external_event
  on public.calendar_sync_records(provider, calendar_id, external_event_id);

create index if not exists calendar_sync_records_user_range_idx
  on public.calendar_sync_records(user_id, provider, calendar_id, synced_start, synced_end);

alter table public.calendar_sync_records enable row level security;
alter table public.calendar_sync_records force row level security;

drop policy if exists calendar_sync_records_select_own on public.calendar_sync_records;
create policy calendar_sync_records_select_own
on public.calendar_sync_records for select
using (public.is_current_user(user_id));

drop policy if exists calendar_sync_records_insert_own on public.calendar_sync_records;
create policy calendar_sync_records_insert_own
on public.calendar_sync_records for insert
with check (public.is_current_user(user_id));

drop policy if exists calendar_sync_records_update_own on public.calendar_sync_records;
create policy calendar_sync_records_update_own
on public.calendar_sync_records for update
using (public.is_current_user(user_id))
with check (public.is_current_user(user_id));

drop policy if exists calendar_sync_records_delete_own on public.calendar_sync_records;
create policy calendar_sync_records_delete_own
on public.calendar_sync_records for delete
using (public.is_current_user(user_id));

drop trigger if exists trg_calendar_sync_records_updated_at on public.calendar_sync_records;
create trigger trg_calendar_sync_records_updated_at
before update on public.calendar_sync_records
for each row execute procedure public.set_updated_at();
