-- Allow Jatinder to view activity logs across all users.
-- Other users continue to see only their own activity logs.

DROP POLICY IF EXISTS activity_logs_owner_select ON activity_logs;

CREATE POLICY activity_logs_owner_select
ON activity_logs
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'jatinder@teambeescorp.com'
);
