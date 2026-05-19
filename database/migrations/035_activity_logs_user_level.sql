-- Activity logs must stay tied to the user who performed the action.
-- Migration 032 intentionally moved business data ownership to the main admin,
-- but activity_logs are audit records and should not be rewritten to admin.

DROP TRIGGER IF EXISTS trg_activity_logs_assign_main_admin_owner ON public.activity_logs;

ALTER TABLE public.activity_logs
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS activity_logs_owner_select ON public.activity_logs;
CREATE POLICY activity_logs_owner_select
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR public.is_jatinder_admin()
);

DROP POLICY IF EXISTS activity_logs_owner_insert ON public.activity_logs;
CREATE POLICY activity_logs_owner_insert
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON public.activity_logs(user_email);
