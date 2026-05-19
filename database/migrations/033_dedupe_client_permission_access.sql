-- Client permission access should tolerate duplicate client rows with the same
-- abbreviation/name. The Admin UI shows one option per client label, and these
-- functions make that one permission cover matching duplicate records too.

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

GRANT EXECUTE ON FUNCTION public.has_contractual_client_module_access(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permanent_client_module_access(INTEGER, TEXT) TO authenticated;
