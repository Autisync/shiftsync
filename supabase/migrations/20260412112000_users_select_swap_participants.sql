-- Allow users to read minimal profile info for themselves and swap participants.
-- This enables showing requester/target names in the swap inbox UI.

drop policy if exists users_select_authenticated on public.users;
drop policy if exists users_select_own on public.users;
drop policy if exists users_select_own_or_swap_participant on public.users;

create policy users_select_own_or_swap_participant
on public.users for select
using (
  public.is_current_user(id)
  or exists (
    select 1
    from public.swap_requests sr
    where (
      public.is_current_user(sr.requester_user_id)
      or public.is_current_user(sr.target_user_id)
    )
    and (
      sr.requester_user_id = public.users.id
      or sr.target_user_id = public.users.id
    )
  )
);
