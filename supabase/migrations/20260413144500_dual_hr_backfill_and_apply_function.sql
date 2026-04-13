-- Dual HR workflow backfill + apply function update.
-- Must run after enum values are committed.

-- Backfill old records into the new dual-HR model.
update public.swap_requests
set requester_hr_sent = true,
    target_hr_sent = true
where status in ('submitted_to_hr', 'approved')
  and (not requester_hr_sent or not target_hr_sent);

update public.swap_requests
set requester_hr_approved = true,
    target_hr_approved = true
where status = 'approved'
  and (not requester_hr_approved or not target_hr_approved);

update public.swap_requests
set calendar_update_enabled = calendar_applied
where calendar_update_enabled = false
  and calendar_applied = true;

update public.swap_requests
set status = 'awaiting_hr_request'
where status in ('accepted', 'submitted_to_hr');

update public.swap_requests
set status = case
  when calendar_applied then 'applied'::public.swap_request_status
  else 'ready_to_apply'::public.swap_request_status
end
where status = 'approved';

-- Apply swap by swapping shift ownership atomically.
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

  if v_requester_shift.user_id = v_request.requester_user_id
     and v_target_shift.user_id = v_request.target_user_id then

    update public.shifts
    set user_id = v_request.target_user_id,
        updated_at = timezone('utc'::text, now())
    where id = v_request.requester_shift_id;

    update public.shifts
    set user_id = v_request.requester_user_id,
        updated_at = timezone('utc'::text, now())
    where id = v_request.target_shift_id;

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
