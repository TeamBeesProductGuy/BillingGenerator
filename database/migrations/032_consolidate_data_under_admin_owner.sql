-- Make Jatinder's account the canonical owner of application data.
-- This preserves data, moves all owner_user_id values to the admin user, and ensures future user edits
-- are written into the same shared admin-owned dataset.

CREATE OR REPLACE FUNCTION public.main_admin_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) IN ('jatinder@teambeescorp.com', 'jatinder@teambeescrop.com')
  ORDER BY CASE WHEN lower(email) = 'jatinder@teambeescorp.com' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assign_main_admin_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := public.main_admin_user_id();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Main admin user Jatinder was not found in auth.users';
  END IF;
  NEW.owner_user_id := v_admin_id;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := public.main_admin_user_id();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Main admin user Jatinder was not found in auth.users';
  END IF;

  UPDATE public.clients SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.permanent_clients SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.permanent_client_contacts SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.permanent_orders SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.permanent_reminders SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.sow_document_index SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.rate_cards SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.attendance SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.billing_runs SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.billing_items SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.billing_errors SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.quotes SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.quote_items SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.sows SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.sow_items SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.purchase_orders SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.po_consumption_log SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.employee_po_history SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.audit_log SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
  UPDATE public.activity_logs SET owner_user_id = v_admin_id WHERE owner_user_id IS DISTINCT FROM v_admin_id;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clients',
    'permanent_clients',
    'permanent_client_contacts',
    'permanent_orders',
    'permanent_reminders',
    'sow_document_index',
    'rate_cards',
    'attendance',
    'billing_runs',
    'billing_items',
    'billing_errors',
    'quotes',
    'quote_items',
    'sows',
    'sow_items',
    'purchase_orders',
    'po_consumption_log',
    'employee_po_history',
    'audit_log',
    'activity_logs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_assign_main_admin_owner ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_assign_main_admin_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assign_main_admin_owner()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.main_admin_user_id() TO authenticated;
