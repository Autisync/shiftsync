-- Phase 6: Swap Approval + HR Workflow
--
-- Adds:
-- 1. HR settings table (hr_email, cc_emails per user)
-- 2. New swap_requests columns for rule violations and workflow tracking
-- 3. Indexes for efficient queries

-- HR Settings table: store per-user HR preferences
create table if not exists public.hr_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  hr_email text not null,
  cc_emails text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (length(trim(hr_email)) > 0)
);

create index if not exists hr_settings_user_id_idx on public.hr_settings(user_id);

-- Add columns to swap_requests for rule validation and workflow tracking
alter table public.swap_requests
  add column if not exists rule_violation text,
  add column if not exists violation_reason text,
  add column if not exists hr_email_sent boolean not null default false,
  add column if not exists calendar_applied boolean not null default false;

-- Create indexes for common queries
create index if not exists swap_requests_status_idx on public.swap_requests(status);
create index if not exists swap_requests_requester_target_idx on public.swap_requests(requester_user_id, target_user_id);
create index if not exists swap_requests_hr_email_sent_idx on public.swap_requests(hr_email_sent)
  where status = 'accepted' and hr_email_sent = false;

-- RLS for hr_settings table
alter table public.hr_settings enable row level security;
alter table public.hr_settings force row level security;

drop policy if exists hr_settings_select_own on public.hr_settings;
create policy hr_settings_select_own
on public.hr_settings for select
using (public.is_current_user(user_id));

drop policy if exists hr_settings_update_own on public.hr_settings;
create policy hr_settings_update_own
on public.hr_settings for update
using (public.is_current_user(user_id))
with check (public.is_current_user(user_id));

drop policy if exists hr_settings_insert_own on public.hr_settings;
create policy hr_settings_insert_own
on public.hr_settings for insert
with check (public.is_current_user(user_id));
