-- =============================================================================
-- Phase 4 Features: Notifications, Action Tokens, Email Deliveries,
-- Reminder Jobs, Sync Sessions, Upload Trust Assessments,
-- Leave Request Attachments, and audit columns on existing tables.
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1. Audit columns on swap_requests (HR decision tracking)
-- -----------------------------------------------------------------------

ALTER TABLE public.swap_requests
  ADD COLUMN IF NOT EXISTS hr_decision_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_decision_actioned_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_decision_action            TEXT CHECK (hr_decision_action IN ('approve','decline')),
  ADD COLUMN IF NOT EXISTS hr_decision_by                TEXT,
  ADD COLUMN IF NOT EXISTS hr_decision_reason            TEXT;

-- -----------------------------------------------------------------------
-- 2. Audit columns on leave_requests (notice policy tracking)
-- -----------------------------------------------------------------------

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS notice_days_requested  INTEGER,
  ADD COLUMN IF NOT EXISTS notice_policy_days     INTEGER,
  ADD COLUMN IF NOT EXISTS notice_policy_breached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_scheduled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at       TIMESTAMPTZ;

-- -----------------------------------------------------------------------
-- 2b. Audit and trust columns on schedule_uploads
-- -----------------------------------------------------------------------

ALTER TABLE public.schedule_uploads
  ADD COLUMN IF NOT EXISTS processing_status          TEXT,
  ADD COLUMN IF NOT EXISTS processing_error           TEXT,
  ADD COLUMN IF NOT EXISTS normalized_coverage_start  DATE,
  ADD COLUMN IF NOT EXISTS normalized_coverage_end    DATE,
  ADD COLUMN IF NOT EXISTS trust_level                TEXT CHECK (trust_level IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS trust_score                NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS trust_reason               TEXT,
  ADD COLUMN IF NOT EXISTS selected_for_sync_at       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS schedule_uploads_user_uploaded_idx
  ON public.schedule_uploads (uploader_user_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS schedule_uploads_coverage_idx
  ON public.schedule_uploads (uploader_user_id, normalized_coverage_start, normalized_coverage_end);

CREATE INDEX IF NOT EXISTS schedule_uploads_hash_idx
  ON public.schedule_uploads (uploader_user_id, file_hash);

-- -----------------------------------------------------------------------
-- 3. action_tokens — signed one-time use tokens for HR decision email links
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.action_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT        NOT NULL UNIQUE,
  entity_type   TEXT        NOT NULL,   -- e.g. 'swap_request', 'leave_request'
  entity_id     UUID        NOT NULL,
  action        TEXT        NOT NULL,   -- e.g. 'approve', 'decline'
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  consumed_by   TEXT,                   -- email of the person who actioned
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_tokens_token_idx         ON public.action_tokens (token);
CREATE INDEX IF NOT EXISTS action_tokens_entity_idx        ON public.action_tokens (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS action_tokens_expires_at_idx    ON public.action_tokens (expires_at);

-- RLS: tokens are consumed by external HR managers (no auth session required
-- for the read path); write access only via service role.
ALTER TABLE public.action_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on action_tokens"
  ON public.action_tokens
  USING (auth.role() = 'service_role');

-- Allow any authenticated user to read a token by its value (for validation)
CREATE POLICY "Authenticated read action_tokens by token"
  ON public.action_tokens
  FOR SELECT
  USING (TRUE);

-- -----------------------------------------------------------------------
-- 4. email_deliveries — outbound email audit log
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT        NOT NULL,   -- 'swap_request' | 'leave_request'
  entity_id      UUID        NOT NULL,
  recipient      TEXT        NOT NULL,
  cc             TEXT[],
  subject        TEXT        NOT NULL,
  body_preview   TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  provider       TEXT        DEFAULT 'supabase_edge',
  status         TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending'))
);

CREATE INDEX IF NOT EXISTS email_deliveries_entity_idx ON public.email_deliveries (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS email_deliveries_sent_at_idx ON public.email_deliveries (sent_at DESC);

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their own email deliveries"
  ON public.email_deliveries
  FOR SELECT
  USING (sent_by = auth.uid());

CREATE POLICY "Service role full access on email_deliveries"
  ON public.email_deliveries
  USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------
-- 5. reminder_jobs — scheduled reminders for leave requests, swaps, etc.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reminder_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type      TEXT        NOT NULL,   -- 'leave_request' | 'swap_request'
  entity_id        UUID        NOT NULL,
  remind_at        TIMESTAMPTZ NOT NULL,
  channel          TEXT        NOT NULL DEFAULT 'email' CHECK (channel IN ('email','push','in_app')),
  message          TEXT,
  sent_at          TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled','failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reminder_jobs_user_remind_idx ON public.reminder_jobs (user_id, remind_at);
CREATE INDEX IF NOT EXISTS reminder_jobs_entity_idx      ON public.reminder_jobs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS reminder_jobs_status_idx      ON public.reminder_jobs (status);

ALTER TABLE public.reminder_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own reminder jobs"
  ON public.reminder_jobs
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 6. notifications — in-app notification inbox
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,   -- 'swap_accepted','leave_approved','hr_decision', etc.
  title        TEXT        NOT NULL,
  body         TEXT,
  entity_type  TEXT,
  entity_id    UUID,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx  ON public.notifications (user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notifications"
  ON public.notifications
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 7. sync_sessions — tracks calendar sync execution runs
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sync_sessions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id          UUID,                                        -- FK to schedule_uploads if applicable
  calendar_id        TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','completed','failed')),
  events_created     INTEGER     DEFAULT 0,
  events_updated     INTEGER     DEFAULT 0,
  events_deleted     INTEGER     DEFAULT 0,
  error_message      TEXT,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_sessions_user_idx ON public.sync_sessions (user_id, created_at DESC);

ALTER TABLE public.sync_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sync sessions"
  ON public.sync_sessions
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 8. upload_trust_assessments — parsed quality/trust metadata per upload
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.upload_trust_assessments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id    UUID        NOT NULL,  -- references schedule_uploads.id
  assessed_by  TEXT        NOT NULL DEFAULT 'system',
  trust_level  TEXT        NOT NULL CHECK (trust_level IN ('high','medium','low')),
  trust_score  NUMERIC(5,2),
  trust_reason TEXT,
  flags        JSONB       DEFAULT '[]',
  assessed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_trust_upload_idx ON public.upload_trust_assessments (upload_id);

ALTER TABLE public.upload_trust_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read upload trust assessments"
  ON public.upload_trust_assessments
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "Service role full access on upload_trust_assessments"
  ON public.upload_trust_assessments
  FOR ALL
  USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------
-- 9. leave_request_attachments — supporting documents for leave requests
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.leave_request_attachments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id  UUID        NOT NULL,  -- references leave_requests.id
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name         TEXT        NOT NULL,
  file_size         BIGINT,
  mime_type         TEXT,
  storage_path      TEXT,                  -- relative path in Supabase Storage bucket
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_attachments_leave_idx ON public.leave_request_attachments (leave_request_id);
CREATE INDEX IF NOT EXISTS leave_attachments_user_idx  ON public.leave_request_attachments (user_id);

ALTER TABLE public.leave_request_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own leave attachments"
  ON public.leave_request_attachments
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 10. Compatibility columns aligned with provider implementation
-- -----------------------------------------------------------------------

-- action_tokens (provider uses workflow_type/target_id)
ALTER TABLE public.action_tokens
  ADD COLUMN IF NOT EXISTS workflow_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID;

CREATE INDEX IF NOT EXISTS action_tokens_workflow_target_idx
  ON public.action_tokens (workflow_type, target_id);

-- email_deliveries (provider writes workflow and payload metadata fields)
ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS workflow_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS to_email TEXT,
  ADD COLUMN IF NOT EXISTS cc_emails TEXT[],
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS email_deliveries_workflow_target_idx
  ON public.email_deliveries (workflow_type, target_id);

-- reminder_jobs (provider uses type/trigger_at/payload)
ALTER TABLE public.reminder_jobs
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS trigger_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS reminder_jobs_user_trigger_idx
  ON public.reminder_jobs (user_id, trigger_at);

-- sync_sessions (provider uses source/summary/error/finished_at)
ALTER TABLE public.sync_sessions
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- upload_trust_assessments (provider expects user and coverage/conflict fields)
ALTER TABLE public.upload_trust_assessments
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS normalized_coverage_start DATE,
  ADD COLUMN IF NOT EXISTS normalized_coverage_end DATE,
  ADD COLUMN IF NOT EXISTS duplicate_coverage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conflicts_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS upload_trust_user_assessed_idx
  ON public.upload_trust_assessments (user_id, assessed_at DESC);

-- leave_request_attachments (provider writes file_type)
ALTER TABLE public.leave_request_attachments
  ADD COLUMN IF NOT EXISTS file_type TEXT;
