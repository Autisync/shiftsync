-- Allow users to delete their own leave requests.
-- Needed for UI cleanup action (remove from request list).

DROP POLICY IF EXISTS leave_requests_delete_own ON public.leave_requests;

CREATE POLICY leave_requests_delete_own
ON public.leave_requests FOR DELETE
USING (user_id = auth.uid());
