-- Backend calendar sync foundation:
-- 1) provider connection storage for server-owned token lifecycle
-- 2) shift conflict/source metadata for safe two-way reconciliation

create table if not exists public.external_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  google_email text,
  default_calendar_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  watch_channel_id text,
  watch_resource_id text,
  watch_expiration timestamptz,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint external_calendar_connections_user_provider_key
    unique (user_id, provider)
);

create index if not exists external_calendar_connections_sync_enabled_idx
  on public.external_calendar_connections(sync_enabled)
  where sync_enabled = true;

create index if not exists external_calendar_connections_provider_idx
  on public.external_calendar_connections(provider);

alter table public.external_calendar_connections enable row level security;
alter table public.external_calendar_connections force row level security;

drop policy if exists external_calendar_connections_select_own on public.external_calendar_connections;
create policy external_calendar_connections_select_own
on public.external_calendar_connections for select
using (auth.uid() = user_id);

drop policy if exists external_calendar_connections_insert_own on public.external_calendar_connections;
create policy external_calendar_connections_insert_own
on public.external_calendar_connections for insert
with check (auth.uid() = user_id);

drop policy if exists external_calendar_connections_update_own on public.external_calendar_connections;
create policy external_calendar_connections_update_own
on public.external_calendar_connections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists external_calendar_connections_delete_own on public.external_calendar_connections;
create policy external_calendar_connections_delete_own
on public.external_calendar_connections for delete
using (auth.uid() = user_id);

drop trigger if exists external_calendar_connections_set_updated_at on public.external_calendar_connections;
create trigger external_calendar_connections_set_updated_at
before update on public.external_calendar_connections
for each row execute procedure public.set_updated_at();

alter table public.shifts
  add column if not exists last_calendar_synced_at timestamptz,
  add column if not exists last_modified_source text,
  add column if not exists last_modified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shifts_last_modified_source_check'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_last_modified_source_check
      check (
        last_modified_source is null
        or last_modified_source in ('app','google','system')
      );
  end if;
end $$;

create index if not exists shifts_last_modified_source_idx
  on public.shifts(last_modified_source);

create index if not exists shifts_last_calendar_synced_at_idx
  on public.shifts(last_calendar_synced_at);
