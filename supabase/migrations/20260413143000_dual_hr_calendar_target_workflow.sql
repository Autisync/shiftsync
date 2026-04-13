-- Dual HR approval workflow + calendar target preference fields.

alter table public.swap_requests
  add column if not exists requester_hr_sent boolean not null default false,
  add column if not exists target_hr_sent boolean not null default false,
  add column if not exists requester_hr_approved boolean not null default false,
  add column if not exists target_hr_approved boolean not null default false,
  add column if not exists calendar_update_enabled boolean not null default false;

alter table public.hr_settings
  add column if not exists selected_calendar_id text,
  add column if not exists selected_calendar_name text,
  add column if not exists last_synced_calendar_id text;

do $$
begin
  alter type public.swap_request_status add value if not exists 'awaiting_hr_request';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.swap_request_status add value if not exists 'ready_to_apply';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.swap_request_status add value if not exists 'applied';
exception
  when duplicate_object then null;
end $$;
