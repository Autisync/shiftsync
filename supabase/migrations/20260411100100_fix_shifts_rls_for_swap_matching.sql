-- Allow authenticated users to read shifts that currently have open swap
-- availability. This is required so the matching engine (getOpenAvailabilities
-- join on shifts(*)) can return the shift data for other users' open slots.
-- Without this the join returns shifts=null, crashing the mapper.

drop policy if exists shifts_select_open_for_swap on public.shifts;

create policy shifts_select_open_for_swap
on public.shifts for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.swap_availability sa
    where sa.shift_id = public.shifts.id
      and sa.is_open = true
  )
);
