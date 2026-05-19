-- Refresh client/module permission helpers and policies.
-- Run this after 030, 031, 032, and 033 if client-scoped permissions are saved
-- but non-admin users still cannot see or use the allowed admin data.

CREATE OR REPLACE FUNCTION public.has_module_access(p_module_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_jatinder_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions ump
      WHERE ump.user_id = auth.uid()
        AND ump.module_key = p_module_key
        AND ump.can_access = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_client_module_permissions ucmp
      WHERE ucmp.user_id = auth.uid()
        AND ucmp.module_key = p_module_key
        AND ucmp.can_access = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.has_contractual_client_module_access(p_client_id INTEGER, p_module_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_jatinder_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions ump
      WHERE ump.user_id = auth.uid()
        AND ump.module_key = p_module_key
        AND ump.can_access = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_client_module_permissions ucmp
      LEFT JOIN public.clients requested_client ON requested_client.id = p_client_id
      LEFT JOIN public.clients permitted_client ON permitted_client.id = ucmp.client_id
      WHERE ucmp.user_id = auth.uid()
        AND ucmp.client_type = 'contractual'
        AND (
          ucmp.client_id = p_client_id
          OR (
            requested_client.id IS NOT NULL
            AND permitted_client.id IS NOT NULL
            AND lower(trim(coalesce(permitted_client.abbreviation, permitted_client.client_name, ''))) =
              lower(trim(coalesce(requested_client.abbreviation, requested_client.client_name, '')))
          )
        )
        AND ucmp.module_key = p_module_key
        AND ucmp.can_access = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permanent_client_module_access(p_client_id INTEGER, p_module_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_jatinder_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_module_permissions ump
      WHERE ump.user_id = auth.uid()
        AND ump.module_key = p_module_key
        AND ump.can_access = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_client_module_permissions ucmp
      LEFT JOIN public.permanent_clients requested_client ON requested_client.id = p_client_id
      LEFT JOIN public.permanent_clients permitted_client ON permitted_client.id = ucmp.client_id
      WHERE ucmp.user_id = auth.uid()
        AND ucmp.client_type = 'permanent'
        AND (
          ucmp.client_id = p_client_id
          OR (
            requested_client.id IS NOT NULL
            AND permitted_client.id IS NOT NULL
            AND lower(trim(coalesce(permitted_client.abbreviation, permitted_client.client_name, ''))) =
              lower(trim(coalesce(requested_client.abbreviation, requested_client.client_name, '')))
          )
        )
        AND ucmp.module_key = p_module_key
        AND ucmp.can_access = TRUE
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_module_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_contractual_client_module_access(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permanent_client_module_access(INTEGER, TEXT) TO authenticated;

ALTER VIEW IF EXISTS public.rate_cards_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.quotes_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.sows_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.purchase_orders_view SET (security_invoker = true);

DROP POLICY IF EXISTS clients_module_select ON public.clients;
CREATE POLICY clients_module_select ON public.clients
FOR SELECT TO authenticated
USING (
  public.has_contractual_client_module_access(id, 'clients')
  OR public.has_contractual_client_module_access(id, 'sows')
  OR public.has_contractual_client_module_access(id, 'quotes')
  OR public.has_contractual_client_module_access(id, 'purchase_orders')
  OR public.has_contractual_client_module_access(id, 'rate_cards')
  OR public.has_contractual_client_module_access(id, 'attendance')
  OR public.has_contractual_client_module_access(id, 'billing')
);

DROP POLICY IF EXISTS billing_items_module_all ON public.billing_items;
CREATE POLICY billing_items_module_all ON public.billing_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.billing_runs br
    WHERE br.id = billing_items.billing_run_id
      AND public.has_contractual_client_module_access(br.client_id, 'billing')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.billing_runs br
    WHERE br.id = billing_items.billing_run_id
      AND public.has_contractual_client_module_access(br.client_id, 'billing')
  )
);

DROP POLICY IF EXISTS billing_errors_module_all ON public.billing_errors;
CREATE POLICY billing_errors_module_all ON public.billing_errors
FOR ALL TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'billing')
  OR EXISTS (
    SELECT 1 FROM public.billing_runs br
    WHERE br.id = billing_errors.billing_run_id
      AND public.has_contractual_client_module_access(br.client_id, 'billing')
  )
)
WITH CHECK (
  public.has_contractual_client_module_access(client_id, 'billing')
  OR EXISTS (
    SELECT 1 FROM public.billing_runs br
    WHERE br.id = billing_errors.billing_run_id
      AND public.has_contractual_client_module_access(br.client_id, 'billing')
  )
);
