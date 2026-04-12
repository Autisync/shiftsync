-- Backfill missing submitted_to_hr_at for already emailed swap requests.
-- Keeps existing workflow but ensures UI can display a timestamp consistently.

update public.swap_requests
set
  submitted_to_hr_at = coalesce(submitted_to_hr_at, updated_at, created_at),
  status = case when status = 'accepted' then 'submitted_to_hr' else status end
where
  hr_email_sent = true
  and submitted_to_hr_at is null;
