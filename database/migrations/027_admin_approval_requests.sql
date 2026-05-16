-- Admin approval workflow for restricted destructive/sensitive actions.
-- Copy/paste this file into Supabase SQL Editor if migrations are not run automatically.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.is_jatinder_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'jatinder@teambeescorp.com';
$$;

CREATE TABLE IF NOT EXISTS public.admin_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL DEFAULT auth.uid(),
  requester_email TEXT,
  requester_name TEXT,
  role_description TEXT,
  module TEXT NOT NULL,
  action_key TEXT NOT NULL,
  action_label TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_label TEXT,
  client_id BIGINT,
  client_name TEXT,
  permission_message TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by_user_id UUID,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_approval_requests_status
  ON public.admin_approval_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_approval_requests_requester
  ON public.admin_approval_requests(requester_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_approval_requests_entity
  ON public.admin_approval_requests(module, entity_type, entity_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_approval_requests_one_pending
  ON public.admin_approval_requests(requester_user_id, module, action_key, entity_type, entity_id)
  WHERE status = 'Pending';

CREATE OR REPLACE FUNCTION public.touch_admin_approval_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_approval_requests_updated_at ON public.admin_approval_requests;
CREATE TRIGGER trg_admin_approval_requests_updated_at
BEFORE UPDATE ON public.admin_approval_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_admin_approval_requests_updated_at();

ALTER TABLE public.admin_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_approval_select ON public.admin_approval_requests;
CREATE POLICY admin_approval_select
ON public.admin_approval_requests
FOR SELECT
TO authenticated
USING (
  requester_user_id = auth.uid()
  OR public.is_jatinder_admin()
);

DROP POLICY IF EXISTS admin_approval_insert ON public.admin_approval_requests;
CREATE POLICY admin_approval_insert
ON public.admin_approval_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requester_user_id = auth.uid()
);

DROP POLICY IF EXISTS admin_approval_update ON public.admin_approval_requests;
CREATE POLICY admin_approval_update
ON public.admin_approval_requests
FOR UPDATE
TO authenticated
USING (public.is_jatinder_admin())
WITH CHECK (public.is_jatinder_admin());

DROP POLICY IF EXISTS admin_approval_delete ON public.admin_approval_requests;
CREATE POLICY admin_approval_delete
ON public.admin_approval_requests
FOR DELETE
TO authenticated
USING (false);
