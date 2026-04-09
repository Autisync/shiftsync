-- Phase 1: Data foundation, RLS, and Supabase auth wiring
-- This migration is idempotent where practical.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text not null unique,
  full_name text,
  email text unique,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (length(trim(employee_code)) > 0)
);

create table if not exists public.schedule_uploads (
  id uuid primary key default gen_random_uuid(),
  uploader_user_id uuid not null references public.users(id) on delete cascade,
  file_hash text not null,
  consent_to_share boolean not null default false,
  uploaded_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb,
  check (length(trim(file_hash)) > 0)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  role text,
  location text,
  source_upload_id uuid references public.schedule_uploads(id) on delete set null,
  google_event_id text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (ends_at > starts_at)
);

create unique index if not exists shifts_user_id_starts_at_ends_at_key
  on public.shifts(user_id, starts_at, ends_at);

create unique index if not exists shifts_google_event_id_key
  on public.shifts(google_event_id)
  where google_event_id is not null;

create table if not exists public.swap_availability (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.shifts(id) on delete cascade,
  is_open boolean not null default true,
  opened_by_user_id uuid not null references public.users(id) on delete cascade,
  opened_at timestamptz not null default timezone('utc'::text, now()),
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  create type public.swap_request_status as enum (
    'pending',
    'accepted',
    'rejected',
    'submitted_to_hr',
    'approved'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.users(id) on delete cascade,
  requester_shift_id uuid not null references public.shifts(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  target_shift_id uuid references public.shifts(id) on delete set null,
  status public.swap_request_status not null default 'pending',
  message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (requester_user_id <> target_user_id)
);

create table if not exists public.constraint_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  swap_request_id uuid references public.swap_requests(id) on delete set null,
  rule_code text not null,
  violation_message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  create type public.leave_request_status as enum (
    'pending',
    'approved',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  type text not null,
  status public.leave_request_status not null default 'pending',
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (end_date >= start_date)
);

do $$
begin
  create type public.schedule_access_request_status as enum (
    'pending',
    'approved',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.schedule_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.users(id) on delete cascade,
  schedule_upload_id uuid not null references public.schedule_uploads(id) on delete cascade,
  consent_given boolean not null default false,
  status public.schedule_access_request_status not null default 'pending',
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Required indexes from the phase checklist.
create index if not exists shifts_date_user_id_idx on public.shifts(date, user_id);
create index if not exists swap_availability_shift_id_is_open_idx on public.swap_availability(shift_id, is_open);
create index if not exists schedule_uploads_file_hash_idx on public.schedule_uploads(file_hash);

-- Helpful operational indexes.
create index if not exists shifts_user_id_starts_at_idx on public.shifts(user_id, starts_at);
create index if not exists swap_requests_requester_status_idx on public.swap_requests(requester_user_id, status);
create index if not exists swap_requests_target_status_idx on public.swap_requests(target_user_id, status);
create index if not exists leave_requests_user_status_idx on public.leave_requests(user_id, status);
create index if not exists schedule_access_requests_upload_status_idx on public.schedule_access_requests(schedule_upload_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.generate_placeholder_employee_code(user_id uuid)
returns text
language sql
immutable
as $$
  select 'pending-' || replace(left(user_id::text, 8), '-', '');
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
  user_employee_code text;
  user_full_name text;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  user_employee_code := nullif(trim(metadata ->> 'employee_code'), '');
  user_full_name := nullif(trim(metadata ->> 'full_name'), '');

  insert into public.users (id, employee_code, full_name, email)
  values (
    new.id,
    coalesce(user_employee_code, public.generate_placeholder_employee_code(new.id)),
    user_full_name,
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.users.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_auth_user();

-- Ensure existing auth users are mirrored into public.users.
insert into public.users (id, employee_code, full_name, email)
select
  au.id,
  coalesce(nullif(trim(au.raw_user_meta_data ->> 'employee_code'), ''), public.generate_placeholder_employee_code(au.id)),
  nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
  au.email
from auth.users au
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.users.full_name);

-- RLS helper functions.
create or replace function public.is_current_user(user_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = user_id;
$$;

create or replace function public.is_shift_owner(shift_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.shifts s
    where s.id = shift_uuid
      and s.user_id = auth.uid()
  );
$$;

alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.swap_availability enable row level security;
alter table public.swap_requests enable row level security;
alter table public.constraint_logs enable row level security;
alter table public.leave_requests enable row level security;
alter table public.schedule_uploads enable row level security;
alter table public.schedule_access_requests enable row level security;

alter table public.users force row level security;
alter table public.shifts force row level security;
alter table public.swap_availability force row level security;
alter table public.swap_requests force row level security;
alter table public.constraint_logs force row level security;
alter table public.leave_requests force row level security;
alter table public.schedule_uploads force row level security;
alter table public.schedule_access_requests force row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own
on public.users for select
using (public.is_current_user(id));

drop policy if exists users_update_own on public.users;
create policy users_update_own
on public.users for update
using (public.is_current_user(id))
with check (public.is_current_user(id));

drop policy if exists shifts_select_own on public.shifts;
create policy shifts_select_own
on public.shifts for select
using (public.is_current_user(user_id));

drop policy if exists shifts_insert_own on public.shifts;
create policy shifts_insert_own
on public.shifts for insert
with check (public.is_current_user(user_id));

drop policy if exists shifts_update_own on public.shifts;
create policy shifts_update_own
on public.shifts for update
using (public.is_current_user(user_id))
with check (public.is_current_user(user_id));

drop policy if exists shifts_delete_own on public.shifts;
create policy shifts_delete_own
on public.shifts for delete
using (public.is_current_user(user_id));

drop policy if exists uploads_select_own on public.schedule_uploads;
create policy uploads_select_own
on public.schedule_uploads for select
using (public.is_current_user(uploader_user_id));

drop policy if exists uploads_insert_own on public.schedule_uploads;
create policy uploads_insert_own
on public.schedule_uploads for insert
with check (public.is_current_user(uploader_user_id));

drop policy if exists uploads_update_own on public.schedule_uploads;
create policy uploads_update_own
on public.schedule_uploads for update
using (public.is_current_user(uploader_user_id))
with check (public.is_current_user(uploader_user_id));

drop policy if exists swap_availability_select_secure on public.swap_availability;
create policy swap_availability_select_secure
on public.swap_availability for select
using (
  public.is_shift_owner(shift_id)
  or exists (
    select 1
    from public.shifts s
    where s.id = public.swap_availability.shift_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists swap_availability_write_owner on public.swap_availability;
create policy swap_availability_write_owner
on public.swap_availability for all
using (public.is_shift_owner(shift_id) and public.is_current_user(opened_by_user_id))
with check (public.is_shift_owner(shift_id) and public.is_current_user(opened_by_user_id));

drop policy if exists swap_requests_select_participants on public.swap_requests;
create policy swap_requests_select_participants
on public.swap_requests for select
using (
  public.is_current_user(requester_user_id)
  or public.is_current_user(target_user_id)
);

drop policy if exists swap_requests_insert_requester on public.swap_requests;
create policy swap_requests_insert_requester
on public.swap_requests for insert
with check (
  public.is_current_user(requester_user_id)
  and public.is_shift_owner(requester_shift_id)
);

drop policy if exists swap_requests_update_participants on public.swap_requests;
create policy swap_requests_update_participants
on public.swap_requests for update
using (
  public.is_current_user(requester_user_id)
  or public.is_current_user(target_user_id)
)
with check (
  public.is_current_user(requester_user_id)
  or public.is_current_user(target_user_id)
);

drop policy if exists constraint_logs_select_own on public.constraint_logs;
create policy constraint_logs_select_own
on public.constraint_logs for select
using (public.is_current_user(user_id));

drop policy if exists constraint_logs_insert_own on public.constraint_logs;
create policy constraint_logs_insert_own
on public.constraint_logs for insert
with check (public.is_current_user(user_id));

drop policy if exists leave_requests_select_own on public.leave_requests;
create policy leave_requests_select_own
on public.leave_requests for select
using (public.is_current_user(user_id));

drop policy if exists leave_requests_insert_own on public.leave_requests;
create policy leave_requests_insert_own
on public.leave_requests for insert
with check (public.is_current_user(user_id));

drop policy if exists leave_requests_update_own on public.leave_requests;
create policy leave_requests_update_own
on public.leave_requests for update
using (public.is_current_user(user_id))
with check (public.is_current_user(user_id));

drop policy if exists access_requests_select_participants on public.schedule_access_requests;
create policy access_requests_select_participants
on public.schedule_access_requests for select
using (
  public.is_current_user(requester_user_id)
  or exists (
    select 1
    from public.schedule_uploads su
    where su.id = public.schedule_access_requests.schedule_upload_id
      and su.uploader_user_id = auth.uid()
  )
);

drop policy if exists access_requests_insert_requester on public.schedule_access_requests;
create policy access_requests_insert_requester
on public.schedule_access_requests for insert
with check (public.is_current_user(requester_user_id));

drop policy if exists access_requests_update_participants on public.schedule_access_requests;
create policy access_requests_update_participants
on public.schedule_access_requests for update
using (
  public.is_current_user(requester_user_id)
  or exists (
    select 1
    from public.schedule_uploads su
    where su.id = public.schedule_access_requests.schedule_upload_id
      and su.uploader_user_id = auth.uid()
  )
)
with check (
  public.is_current_user(requester_user_id)
  or exists (
    select 1
    from public.schedule_uploads su
    where su.id = public.schedule_access_requests.schedule_upload_id
      and su.uploader_user_id = auth.uid()
  )
);

-- Keep updated_at columns current.
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
before update on public.shifts
for each row execute procedure public.set_updated_at();

drop trigger if exists swap_availability_set_updated_at on public.swap_availability;
create trigger swap_availability_set_updated_at
before update on public.swap_availability
for each row execute procedure public.set_updated_at();

drop trigger if exists swap_requests_set_updated_at on public.swap_requests;
create trigger swap_requests_set_updated_at
before update on public.swap_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at
before update on public.leave_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists schedule_access_requests_set_updated_at on public.schedule_access_requests;
create trigger schedule_access_requests_set_updated_at
before update on public.schedule_access_requests
for each row execute procedure public.set_updated_at();
