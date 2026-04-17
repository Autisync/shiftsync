-- Phase 10: allow authenticated swap participants to create HR workflow tokens
-- and delivery audit rows from the client-side swap acceptance flow.

BEGIN;

-- action_tokens inserts for swap HR workflow
DROP POLICY IF EXISTS "Authenticated create swap action_tokens" ON public.action_tokens;
CREATE POLICY "Authenticated create swap action_tokens"
  ON public.action_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workflow_type = 'swap_hr_decision'
    AND entity_type = 'swap_request'
    AND entity_id = target_id
    AND (
      created_by IS NULL
      OR created_by = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.swap_requests sr
      WHERE sr.id = action_tokens.target_id
        AND (
          sr.requester_user_id = auth.uid()
          OR sr.target_user_id = auth.uid()
        )
    )
  );

-- email_deliveries inserts for swap HR workflow
DROP POLICY IF EXISTS "Authenticated create swap email_deliveries" ON public.email_deliveries;
CREATE POLICY "Authenticated create swap email_deliveries"
  ON public.email_deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workflow_type = 'swap_hr_decision'
    AND entity_type = 'swap_request'
    AND entity_id = target_id
    AND (
      sent_by IS NULL
      OR sent_by = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.swap_requests sr
      WHERE sr.id = email_deliveries.target_id
        AND (
          sr.requester_user_id = auth.uid()
          OR sr.target_user_id = auth.uid()
        )
    )
  );

COMMIT;
