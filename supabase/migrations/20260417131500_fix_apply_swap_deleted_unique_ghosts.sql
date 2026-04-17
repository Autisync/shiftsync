-- Fix apply_swap_request unique violations caused by deleted ghost rows.
--
-- The table enforces unique(user_id, starts_at, ends_at) for all rows,
-- including status='deleted'. During a swap, if a deleted historical row
-- exists in one of the destination slots, the ownership update can hit 23505
-- even though there is no active scheduling conflict.

create or replace function public.apply_swap_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_request public.swap_requests%rowtype;
  v_requester_shift public.shifts%rowtype;
  v_target_shift public.shifts%rowtype;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_request
  from public.swap_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Swap request not found';
  end if;

  if v_actor <> v_request.requester_user_id and v_actor <> v_request.target_user_id then
    raise exception 'Not authorized to apply this swap';
  end if;

  if v_request.status not in ('ready_to_apply', 'approved') then
    raise exception 'Swap must be ready before applying';
  end if;

  if v_request.calendar_applied then
    return;
  end if;

  if v_request.target_shift_id is null then
    raise exception 'Target shift is required to apply swap';
  end if;

  select *
  into v_requester_shift
  from public.shifts
  where id = v_request.requester_shift_id
  for update;

  if not found then
    raise exception 'Requester shift not found';
  end if;

  select *
  into v_target_shift
  from public.shifts
  where id = v_request.target_shift_id
  for update;

  if not found then
    raise exception 'Target shift not found';
  end if;

  -- Normal case: ownership matches request snapshot.
  if v_requester_shift.user_id = v_request.requester_user_id
     and v_target_shift.user_id = v_request.target_user_id then

    -- Detect real conflicts with third-party active rows before swapping.
    if exists (
      select 1
      from public.shifts s
      where s.user_id = v_request.target_user_id
        and s.starts_at = v_requester_shift.starts_at
        and s.ends_at = v_requester_shift.ends_at
        and coalesce(s.status, 'active') <> 'deleted'
        and s.id not in (v_request.requester_shift_id, v_request.target_shift_id)
    ) then
      raise exception 'Swap cannot be applied: target user already has a shift in requester slot';
    end if;

    if exists (
      select 1
      from public.shifts s
      where s.user_id = v_request.requester_user_id
        and s.starts_at = v_target_shift.starts_at
        and s.ends_at = v_target_shift.ends_at
        and coalesce(s.status, 'active') <> 'deleted'
        and s.id not in (v_request.requester_shift_id, v_request.target_shift_id)
    ) then
      raise exception 'Swap cannot be applied: requester already has a shift in target slot';
    end if;

    -- Remove deleted ghost rows that would violate unique(user_id, starts_at, ends_at)
    -- for the destination ownership after swap.
    delete from public.shifts s
    where s.user_id = v_request.target_user_id
      and s.starts_at = v_requester_shift.starts_at
      and s.ends_at = v_requester_shift.ends_at
      and coalesce(s.status, 'active') = 'deleted'
      and s.id not in (v_request.requester_shift_id, v_request.target_shift_id);

    delete from public.shifts s
    where s.user_id = v_request.requester_user_id
      and s.starts_at = v_target_shift.starts_at
      and s.ends_at = v_target_shift.ends_at
      and coalesce(s.status, 'active') = 'deleted'
      and s.id not in (v_request.requester_shift_id, v_request.target_shift_id);

    -- Swap ownership in one statement, reset calendar identity so the sync
    -- engine treats both rows as new events in the new owners' calendars.
    update public.shifts
    set user_id = case
          when id = v_request.requester_shift_id then v_request.target_user_id
          when id = v_request.target_shift_id    then v_request.requester_user_id
          else user_id
        end,
        shift_uid = case
          when id = v_request.requester_shift_id then
            'su_' || md5(concat_ws('|',
              v_request.target_user_id::text,
              date::text,
              to_char(starts_at at time zone 'utc', 'HH24:MI'),
              to_char(ends_at   at time zone 'utc', 'HH24:MI')
            ))
          when id = v_request.target_shift_id then
            'su_' || md5(concat_ws('|',
              v_request.requester_user_id::text,
              date::text,
              to_char(starts_at at time zone 'utc', 'HH24:MI'),
              to_char(ends_at   at time zone 'utc', 'HH24:MI')
            ))
          else shift_uid
        end,
        google_event_id = case
          when id in (v_request.requester_shift_id, v_request.target_shift_id)
          then null
          else google_event_id
        end,
        updated_at = timezone('utc'::text, now())
    where id in (v_request.requester_shift_id, v_request.target_shift_id);

  -- Idempotent case: shifts already swapped in a previous call.
  elsif v_requester_shift.user_id = v_request.target_user_id
     and v_target_shift.user_id = v_request.requester_user_id then
    null;
  else
    raise exception 'Swap cannot be applied: shift ownership changed since approval';
  end if;

  update public.swap_requests
  set status = 'applied',
      calendar_applied = true,
      calendar_update_enabled = true,
      updated_at = timezone('utc'::text, now())
  where id = v_request.id;
end;
$$;

revoke all on function public.apply_swap_request(uuid) from public;
grant execute on function public.apply_swap_request(uuid) to authenticated;
