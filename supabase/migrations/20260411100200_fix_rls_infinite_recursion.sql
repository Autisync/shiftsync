-- Fix infinite recursion caused by:
--   shifts_select_open_for_swap -> swap_availability (triggers swap_availability policy)
--   swap_availability_select_secure -> shifts (triggers shifts policy)
--
-- Solution:
--   1. Rewrite swap_availability_select_secure to use opened_by_user_id directly
--      (no join to shifts needed, breaks the cycle from that side)
--   2. Use a SECURITY DEFINER helper for the shifts policy so it queries
--      swap_availability without going through RLS

-- Helper: check if a shift has open availability, bypassing RLS
create or replace function public.shift_has_open_availability(shift_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.swap_availability sa
    where sa.shift_id = shift_uuid
      and sa.is_open = true
  );
$$;

-- Fix swap_availability SELECT: use opened_by_user_id instead of joining shifts
drop policy if exists swap_availability_select_secure on public.swap_availability;

create policy swap_availability_select_secure
on public.swap_availability for select
using (
  auth.uid() is not null
  and (
    -- your own rows (open or closed)
    opened_by_user_id = auth.uid()
    -- other users' open rows (for matching engine)
    or is_open = true
  )
);

-- Fix shifts SELECT: use SECURITY DEFINER function to avoid re-entering RLS
drop policy if exists shifts_select_open_for_swap on public.shifts;

create policy shifts_select_open_for_swap
on public.shifts for select
using (
  auth.uid() is not null
  and public.shift_has_open_availability(id)
);
