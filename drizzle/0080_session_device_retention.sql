-- Retention job lease only; no existing learner or authentication records are deleted by this migration.
CREATE TABLE IF NOT EXISTS public.session_device_retention_state (
 task_key text PRIMARY KEY,
 last_run_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT session_device_retention_task_ck CHECK (task_key='security_metadata')
);
ALTER TABLE public.session_device_retention_state ENABLE ROW LEVEL SECURITY;
