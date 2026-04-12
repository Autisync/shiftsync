-- Apply approved swap by swapping shift ownership atomically.
-- This is executed as SECURITY DEFINER so it can update both participants' shifts safely.

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

  if v_request.status <> 'approved' then
    raise exception 'Swap must be approved before applying';
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

  if v_requester_shift.user_id <> v_request.requester_user_id then
    raise exception 'Requester shift ownership mismatch';
  end if;

  if v_target_shift.user_id <> v_request.target_user_id then
    raise exception 'Target shift ownership mismatch';
  end if;

  update public.shifts
  set user_id = v_request.target_user_id,
      updated_at = timezone('utc'::text, now())
  where id = v_request.requester_shift_id;

  update public.shifts
  set user_id = v_request.requester_user_id,
      updated_at = timezone('utc'::text, now())
  where id = v_request.target_shift_id;

  update public.swap_requests
  set calendar_applied = true,
      updated_at = timezone('utc'::text, now())
  where id = v_request.id;
end;
$$;

revoke all on function public.apply_swap_request(uuid) from public;
grant execute on function public.apply_swap_request(uuid) to authenticated;
