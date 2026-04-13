-- Persist default Google Calendar selection per user.

create table if not exists public.user_calendar_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  calendar_id text not null,
  calendar_name text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (length(trim(calendar_id)) > 0)
);

create index if not exists user_calendar_preferences_user_id_idx
  on public.user_calendar_preferences(user_id);

alter table public.user_calendar_preferences enable row level security;
alter table public.user_calendar_preferences force row level security;

drop policy if exists user_calendar_preferences_select_own on public.user_calendar_preferences;
create policy user_calendar_preferences_select_own
on public.user_calendar_preferences for select
using (public.is_current_user(user_id));

drop policy if exists user_calendar_preferences_insert_own on public.user_calendar_preferences;
create policy user_calendar_preferences_insert_own
on public.user_calendar_preferences for insert
with check (public.is_current_user(user_id));

drop policy if exists user_calendar_preferences_update_own on public.user_calendar_preferences;
create policy user_calendar_preferences_update_own
on public.user_calendar_preferences for update
using (public.is_current_user(user_id))
with check (public.is_current_user(user_id));

drop trigger if exists user_calendar_preferences_set_updated_at on public.user_calendar_preferences;
create trigger user_calendar_preferences_set_updated_at
before update on public.user_calendar_preferences
for each row execute procedure public.set_updated_at();
