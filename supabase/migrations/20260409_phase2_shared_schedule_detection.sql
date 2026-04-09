-- Phase 2: Shared schedule detection and consent management
-- This migration adds functions and triggers for shared schedule recovery

-- Helper function to detect if an upload has a verified shared schedule
create or replace function public.detect_shared_schedule(upload_id uuid)
returns jsonb as $$
declare
  upload_hash text;
  matching_count integer;
  shared_schedule_data jsonb;
begin
  -- Get the file hash
  select file_hash into upload_hash
  from public.schedule_uploads
  where id = upload_id;

  if upload_hash is null then
    return jsonb_build_object(
      'is_shared', false,
      'reason', 'Upload not found'
    );
  end if;

  -- Count uploads with same hash where uploader has consent_to_share = true
  select count(*)::integer into matching_count
  from public.schedule_uploads
  where file_hash = upload_hash
    and consent_to_share = true;

  -- Consider it a shared schedule if >= 2 uploads with consent
  if matching_count >= 2 then
    -- Get metadata about other sharers
    select jsonb_object_agg(
      uo.uploader_user_id::text,
      jsonb_build_object(
        'upload_id', uo.id,
        'uploaded_at', uo.uploaded_at,
        'shift_count', (
          select count(*)
          from public.shifts
          where source_upload_id = uo.id
        )
      )
    ) into shared_schedule_data
    from public.schedule_uploads uo
    where uo.file_hash = upload_hash
      and uo.consent_to_share = true;

    return jsonb_build_object(
      'is_shared', true,
      'matching_count', matching_count,
      'uploaders', shared_schedule_data
    );
  end if;

  return jsonb_build_object(
    'is_shared', false,
    'matching_count', matching_count,
    'reason', 'Not enough consenting uploads to constitute a shared schedule'
  );
end;
$$ language plpgsql;

-- Function to validate shift constraints (max 60 hours/week, max 6 consecutive days)
create or replace function public.validate_shift_constraints(
  p_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb as $$
declare
  week_start date;
  week_end date;
  week_hours numeric;
  consecutive_days integer;
  max_hours constant numeric := 60;
  max_consecutive_days constant integer := 6;
begin
  -- Calculate week boundaries (Monday to Sunday)
  week_start := date_trunc('week', p_starts_at::date)::date;
  week_end := week_start + interval '6 days';

  -- Calculate hours for this week
  select coalesce(sum(extract(epoch from (ends_at - starts_at)) / 3600), 0)
  into week_hours
  from public.shifts
  where user_id = p_user_id
    and date_trunc('week', starts_at::date) = date_trunc('week', p_starts_at::date);

  if week_hours + (extract(epoch from (p_ends_at - p_starts_at)) / 3600) > max_hours then
    return jsonb_build_object(
      'valid', false,
      'constraint', 'MAX_HOURS_PER_WEEK',
      'current_hours', week_hours,
      'new_shift_hours', extract(epoch from (p_ends_at - p_starts_at)) / 3600,
      'max_allowed', max_hours
    );
  end if;

  -- Check consecutive working days (simplified - count distinct dates in last 7 days)
  select count(distinct date)
  into consecutive_days
  from public.shifts
  where user_id = p_user_id
    and date >= (p_starts_at::date - interval '6 days')
    and date <= p_starts_at::date
    and not exists (
      select 1 from public.shifts s2
      where s2.user_id = p_user_id
        and s2.date > s2.date
    );

  if consecutive_days >= max_consecutive_days then
    return jsonb_build_object(
      'valid', false,
      'constraint', 'MAX_CONSECUTIVE_DAYS',
      'consecutive_days', consecutive_days,
      'max_allowed', max_consecutive_days
    );
  end if;

  return jsonb_build_object('valid', true);
end;
$$ language plpgsql;

-- Function to check if a shift is already shared with another user
create or replace function public.find_shareable_shifts(
  p_file_hash text,
  p_receiver_user_id uuid
)
returns table(
  upload_id uuid,
  shift_id uuid,
  user_id uuid,
  "date" date,
  starts_at timestamptz,
  ends_at timestamptz,
  role text,
  location text
) as $$
begin
  return query
  select
    su.id,
    s.id,
    s.user_id,
    s.date,
    s.starts_at,
    s.ends_at,
    s.role,
    s.location
  from public.shifts s
  join public.schedule_uploads su on s.source_upload_id = su.id
  where su.file_hash = p_file_hash
    and su.consent_to_share = true
    and s.user_id != p_receiver_user_id
  limit 100;
end;
$$ language plpgsql;

-- Create index on file_hash for faster shared schedule detection
create index if not exists idx_schedule_uploads_file_hash
  on public.schedule_uploads(file_hash);

-- Create index on source_upload_id for faster shift queries by upload
create index if not exists idx_shifts_source_upload_id
  on public.shifts(source_upload_id);

-- Update trigger to auto-update metadata when upload status changes
create or replace function public.update_upload_metadata()
returns trigger as $$
begin
  -- Auto-detect shared schedule on insert
  if new.consent_to_share = true then
    new.metadata := new.metadata || detect_shared_schedule(new.id);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_upload_metadata
before insert on public.schedule_uploads
for each row
execute function public.update_upload_metadata();

comment on function public.detect_shared_schedule(uuid) is
  'Detects if an upload is part of a verified shared schedule (≥2 uploads with same hash and consent_to_share=true)';

comment on function public.validate_shift_constraints(uuid, timestamptz, timestamptz) is
  'Validates domain constraints: max 60 hours/week, max 6 consecutive working days';

comment on function public.find_shareable_shifts(text, uuid) is
  'Finds shifts from uploads with matching file_hash that can be shared with a user';
