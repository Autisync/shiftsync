-- Phase 2 functional fixes
-- Applies corrective logic for shared schedule metadata and constraints.

-- 1) Shared-schedule detection by file hash
create or replace function public.detect_shared_schedule_by_hash(p_file_hash text)
returns jsonb
language plpgsql
as $$
declare
  matching_count integer;
  shared_schedule_data jsonb;
begin
  if p_file_hash is null or length(trim(p_file_hash)) = 0 then
    return jsonb_build_object(
      'is_shared', false,
      'reason', 'Missing file hash'
    );
  end if;

  select count(*)::integer
  into matching_count
  from public.schedule_uploads su
  where su.file_hash = p_file_hash
    and su.consent_to_share = true;

  if matching_count < 2 then
    return jsonb_build_object(
      'is_shared', false,
      'matching_count', matching_count,
      'reason', 'Not enough consenting uploads to constitute a shared schedule'
    );
  end if;

  select jsonb_object_agg(
    su.uploader_user_id::text,
    jsonb_build_object(
      'upload_id', su.id,
      'uploaded_at', su.uploaded_at,
      'shift_count', (
        select count(*)
        from public.shifts s
        where s.source_upload_id = su.id
      )
    )
  )
  into shared_schedule_data
  from public.schedule_uploads su
  where su.file_hash = p_file_hash
    and su.consent_to_share = true;

  return jsonb_build_object(
    'is_shared', true,
    'matching_count', matching_count,
    'uploaders', coalesce(shared_schedule_data, '{}'::jsonb)
  );
end;
$$;

create or replace function public.detect_shared_schedule(upload_id uuid)
returns jsonb
language plpgsql
as $$
declare
  upload_hash text;
begin
  select su.file_hash
  into upload_hash
  from public.schedule_uploads su
  where su.id = upload_id;

  return public.detect_shared_schedule_by_hash(upload_hash);
end;
$$;

-- 2) Corrected constraints validation function
create or replace function public.validate_shift_constraints(
  p_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
as $$
declare
  week_hours numeric;
  new_shift_hours numeric;
  max_hours constant numeric := 60;
  max_consecutive_days constant integer := 6;
  streak_count integer;
  shift_date date := p_starts_at::date;
begin
  select coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600), 0)
  into week_hours
  from public.shifts s
  where s.user_id = p_user_id
    and date_trunc('week', s.starts_at::date) = date_trunc('week', shift_date);

  new_shift_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600;

  if week_hours + new_shift_hours > max_hours then
    return jsonb_build_object(
      'valid', false,
      'constraint', 'MAX_HOURS_PER_WEEK',
      'current_hours', week_hours,
      'new_shift_hours', new_shift_hours,
      'max_allowed', max_hours
    );
  end if;

  -- Consecutive-days check on trailing 6-day window ending at new shift date.
  with target_days as (
    select generate_series(shift_date - interval '5 day', shift_date, interval '1 day')::date as d
  ), occupied_days as (
    select distinct s.date as d
    from public.shifts s
    where s.user_id = p_user_id
      and s.date between shift_date - interval '5 day' and shift_date
    union
    select shift_date
  )
  select count(*)::int
  into streak_count
  from target_days td
  join occupied_days od on od.d = td.d;

  if streak_count >= max_consecutive_days then
    return jsonb_build_object(
      'valid', false,
      'constraint', 'MAX_CONSECUTIVE_DAYS',
      'consecutive_days', streak_count,
      'max_allowed', max_consecutive_days
    );
  end if;

  return jsonb_build_object('valid', true);
end;
$$;

-- 3) Trigger fix: evaluate shared schedule by file hash in BEFORE INSERT
create or replace function public.update_upload_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.consent_to_share = true then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || public.detect_shared_schedule_by_hash(new.file_hash);
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_update_upload_metadata on public.schedule_uploads;
create trigger trigger_update_upload_metadata
before insert on public.schedule_uploads
for each row
execute function public.update_upload_metadata();

comment on function public.detect_shared_schedule_by_hash(text) is
  'Detects whether a file hash is a verified shared schedule (>=2 consenting uploads)';
