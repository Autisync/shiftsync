-- Phase 3: deterministic shift identity + lifecycle tracking for idempotent sync

alter table public.shifts
  add column if not exists shift_uid text,
  add column if not exists upload_batch_id uuid,
  add column if not exists last_seen_at timestamptz,
  add column if not exists status text;

-- Keep upload batch linked to an upload when available.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shifts_upload_batch_id_fkey'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_upload_batch_id_fkey
      foreign key (upload_batch_id)
      references public.schedule_uploads(id)
      on delete set null;
  end if;
end $$;

-- Backfill lifecycle defaults for existing rows.
update public.shifts
set last_seen_at = coalesce(last_seen_at, timezone('utc'::text, now())),
    status = coalesce(status, 'active')
where last_seen_at is null
   or status is null;

-- Backfill deterministic shift_uid for existing records.
update public.shifts
set shift_uid = coalesce(
  shift_uid,
  'su_' || md5(
    concat_ws(
      '|',
      user_id::text,
      date::text,
      to_char(starts_at at time zone 'utc', 'HH24:MI'),
      to_char(ends_at at time zone 'utc', 'HH24:MI')
    )
  )
)
where shift_uid is null;

alter table public.shifts
  alter column shift_uid set not null,
  alter column last_seen_at set not null,
  alter column status set default 'active',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shifts_status_check'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_status_check
      check (status in ('active', 'deleted'));
  end if;
end $$;

-- Required for parser upsert on (user_id, shift_uid).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shifts_user_shift_uid_key'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_user_shift_uid_key
      unique (user_id, shift_uid);
  end if;
end $$;

create index if not exists shifts_user_status_date_idx
  on public.shifts(user_id, status, date);
