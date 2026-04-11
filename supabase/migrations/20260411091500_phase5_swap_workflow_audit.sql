alter table public.swap_requests
  add column if not exists status_history jsonb not null default '[]'::jsonb,
  add column if not exists pending_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists submitted_to_hr_at timestamptz,
  add column if not exists approved_at timestamptz;

update public.swap_requests
set
  pending_at = coalesce(pending_at, created_at),
  accepted_at = case when status = 'accepted' then coalesce(accepted_at, updated_at) else accepted_at end,
  rejected_at = case when status = 'rejected' then coalesce(rejected_at, updated_at) else rejected_at end,
  submitted_to_hr_at = case when status = 'submitted_to_hr' then coalesce(submitted_to_hr_at, updated_at) else submitted_to_hr_at end,
  approved_at = case when status = 'approved' then coalesce(approved_at, updated_at) else approved_at end,
  status_history = case
    when jsonb_typeof(status_history) = 'array' and jsonb_array_length(status_history) > 0 then status_history
    else
      jsonb_build_array(
        jsonb_build_object(
          'status', 'pending',
          'changed_at', coalesce(created_at, timezone('utc'::text, now())),
          'changed_by_user_id', requester_user_id
        )
      )
      ||
      case
        when status <> 'pending' then jsonb_build_array(
          jsonb_build_object(
            'status', status,
            'changed_at', coalesce(updated_at, timezone('utc'::text, now())),
            'changed_by_user_id', null
          )
        )
        else '[]'::jsonb
      end
  end;
