-- Fix swap_availability SELECT policy so users can see other users' open
-- availabilities (required for the matching engine / "Sugestoes de Troca").
-- Previously both branches were equivalent to auth.uid() = shift owner,
-- which meant every user could only read their own rows.

drop policy if exists swap_availability_select_secure on public.swap_availability;

create policy swap_availability_select_secure
on public.swap_availability for select
using (
  auth.uid() is not null
  and (
    -- always see your own rows (open or closed)
    exists (
      select 1
      from public.shifts s
      where s.id = public.swap_availability.shift_id
        and s.user_id = auth.uid()
    )
    -- see other users' rows only when they are open (needed for matching)
    or is_open = true
  )
);
