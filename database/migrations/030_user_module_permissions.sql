-- Module-level page/API access controlled by Admin.

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  user_id UUID NOT NULL,
  module_key TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, module_key),
  CONSTRAINT user_module_permissions_module_check CHECK (
    module_key IN (
      'clients',
      'sows',
      'quotes',
      'purchase_orders',
      'rate_cards',
      'attendance',
      'billing',
      'orders',
      'reminders'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user
  ON public.user_module_permissions(user_id);

CREATE TABLE IF NOT EXISTS public.user_client_module_permissions (
  user_id UUID NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'contractual',
  client_id INTEGER NOT NULL,
  module_key TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_type, client_id, module_key),
  CONSTRAINT user_client_module_permissions_type_check CHECK (
    client_type IN ('contractual', 'permanent')
  ),
  CONSTRAINT user_client_module_permissions_module_check CHECK (
    module_key IN (
      'clients',
      'sows',
      'quotes',
      'purchase_orders',
      'rate_cards',
      'attendance',
      'billing',
      'orders',
      'reminders'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_client_module_permissions_user
  ON public.user_client_module_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_client_module_permissions_client
  ON public.user_client_module_permissions(client_type, client_id);

INSERT INTO public.user_module_permissions (user_id, module_key, can_access)
SELECT users.id, modules.module_key, TRUE
FROM auth.users AS users
CROSS JOIN (
  VALUES
    ('clients'),
    ('sows'),
    ('quotes'),
    ('purchase_orders'),
    ('rate_cards'),
    ('attendance'),
    ('billing'),
    ('orders'),
    ('reminders')
) AS modules(module_key)
ON CONFLICT (user_id, module_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_user_module_permissions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_module_permissions_updated_at ON public.user_module_permissions;
CREATE TRIGGER trg_user_module_permissions_updated_at
BEFORE UPDATE ON public.user_module_permissions
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_module_permissions_updated_at();

CREATE OR REPLACE FUNCTION public.touch_user_client_module_permissions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_client_module_permissions_updated_at ON public.user_client_module_permissions;
CREATE TRIGGER trg_user_client_module_permissions_updated_at
BEFORE UPDATE ON public.user_client_module_permissions
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_client_module_permissions_updated_at();

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_client_module_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_module_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_client_module_permissions TO authenticated;

DROP POLICY IF EXISTS user_module_permissions_select ON public.user_module_permissions;
CREATE POLICY user_module_permissions_select
ON public.user_module_permissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_jatinder_admin()
);

DROP POLICY IF EXISTS user_module_permissions_insert ON public.user_module_permissions;
CREATE POLICY user_module_permissions_insert
ON public.user_module_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.is_jatinder_admin());

DROP POLICY IF EXISTS user_module_permissions_update ON public.user_module_permissions;
CREATE POLICY user_module_permissions_update
ON public.user_module_permissions
FOR UPDATE
TO authenticated
USING (public.is_jatinder_admin())
WITH CHECK (public.is_jatinder_admin());

DROP POLICY IF EXISTS user_module_permissions_delete ON public.user_module_permissions;
CREATE POLICY user_module_permissions_delete
ON public.user_module_permissions
FOR DELETE
TO authenticated
USING (public.is_jatinder_admin());

DROP POLICY IF EXISTS user_client_module_permissions_select ON public.user_client_module_permissions;
CREATE POLICY user_client_module_permissions_select
ON public.user_client_module_permissions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_jatinder_admin()
);

DROP POLICY IF EXISTS user_client_module_permissions_insert ON public.user_client_module_permissions;
CREATE POLICY user_client_module_permissions_insert
ON public.user_client_module_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.is_jatinder_admin());

DROP POLICY IF EXISTS user_client_module_permissions_update ON public.user_client_module_permissions;
CREATE POLICY user_client_module_permissions_update
ON public.user_client_module_permissions
FOR UPDATE
TO authenticated
USING (public.is_jatinder_admin())
WITH CHECK (public.is_jatinder_admin());

DROP POLICY IF EXISTS user_client_module_permissions_delete ON public.user_client_module_permissions;
CREATE POLICY user_client_module_permissions_delete
ON public.user_client_module_permissions
FOR DELETE
TO authenticated
USING (public.is_jatinder_admin());
