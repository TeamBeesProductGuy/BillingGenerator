-- Keep RLS enabled, but let Admin-assigned client/module permissions drive app access.
-- Owner policies can remain; these policies add the shared-admin-data access layer.

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

-- Remove older broad module policies if this migration is run after the previous draft.
DROP POLICY IF EXISTS quotes_module_insert ON public.quotes;
DROP POLICY IF EXISTS quotes_module_update ON public.quotes;
DROP POLICY IF EXISTS quotes_module_delete ON public.quotes;
DROP POLICY IF EXISTS quote_items_module_insert ON public.quote_items;
DROP POLICY IF EXISTS quote_items_module_update ON public.quote_items;
DROP POLICY IF EXISTS quote_items_module_delete ON public.quote_items;
DROP POLICY IF EXISTS sows_module_insert ON public.sows;
DROP POLICY IF EXISTS sows_module_update ON public.sows;
DROP POLICY IF EXISTS sows_module_delete ON public.sows;
DROP POLICY IF EXISTS sow_items_module_insert ON public.sow_items;
DROP POLICY IF EXISTS sow_items_module_update ON public.sow_items;
DROP POLICY IF EXISTS sow_items_module_delete ON public.sow_items;
DROP POLICY IF EXISTS purchase_orders_module_insert ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_module_update ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_module_delete ON public.purchase_orders;
DROP POLICY IF EXISTS po_consumption_log_module_select ON public.po_consumption_log;
DROP POLICY IF EXISTS po_consumption_log_module_insert ON public.po_consumption_log;
DROP POLICY IF EXISTS employee_po_history_module_select ON public.employee_po_history;
DROP POLICY IF EXISTS employee_po_history_module_insert ON public.employee_po_history;
DROP POLICY IF EXISTS rate_cards_module_insert ON public.rate_cards;
DROP POLICY IF EXISTS rate_cards_module_update ON public.rate_cards;
DROP POLICY IF EXISTS rate_cards_module_delete ON public.rate_cards;
DROP POLICY IF EXISTS attendance_module_select ON public.attendance;
DROP POLICY IF EXISTS attendance_module_insert ON public.attendance;
DROP POLICY IF EXISTS attendance_module_update ON public.attendance;
DROP POLICY IF EXISTS attendance_module_delete ON public.attendance;
DROP POLICY IF EXISTS billing_runs_module_select ON public.billing_runs;
DROP POLICY IF EXISTS billing_runs_module_insert ON public.billing_runs;
DROP POLICY IF EXISTS billing_runs_module_update ON public.billing_runs;
DROP POLICY IF EXISTS billing_runs_module_delete ON public.billing_runs;
DROP POLICY IF EXISTS permanent_reminders_module_insert ON public.permanent_reminders;
DROP POLICY IF EXISTS permanent_reminders_module_update ON public.permanent_reminders;
DROP POLICY IF EXISTS permanent_reminders_module_delete ON public.permanent_reminders;

-- Contractual clients.
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

DROP POLICY IF EXISTS clients_module_insert ON public.clients;
CREATE POLICY clients_module_insert ON public.clients
FOR INSERT TO authenticated
WITH CHECK (public.has_module_access('clients'));

DROP POLICY IF EXISTS clients_module_update ON public.clients;
CREATE POLICY clients_module_update ON public.clients
FOR UPDATE TO authenticated
USING (public.has_contractual_client_module_access(id, 'clients'))
WITH CHECK (public.has_contractual_client_module_access(id, 'clients'));

DROP POLICY IF EXISTS clients_module_delete ON public.clients;
CREATE POLICY clients_module_delete ON public.clients
FOR DELETE TO authenticated
USING (public.has_contractual_client_module_access(id, 'clients'));

-- Permanent client flow.
DROP POLICY IF EXISTS permanent_clients_module_select ON public.permanent_clients;
CREATE POLICY permanent_clients_module_select ON public.permanent_clients
FOR SELECT TO authenticated
USING (
  public.has_permanent_client_module_access(id, 'clients')
  OR public.has_permanent_client_module_access(id, 'orders')
  OR public.has_permanent_client_module_access(id, 'reminders')
);

DROP POLICY IF EXISTS permanent_clients_module_insert ON public.permanent_clients;
CREATE POLICY permanent_clients_module_insert ON public.permanent_clients
FOR INSERT TO authenticated
WITH CHECK (public.has_module_access('clients'));

DROP POLICY IF EXISTS permanent_clients_module_update ON public.permanent_clients;
CREATE POLICY permanent_clients_module_update ON public.permanent_clients
FOR UPDATE TO authenticated
USING (public.has_permanent_client_module_access(id, 'clients'))
WITH CHECK (public.has_permanent_client_module_access(id, 'clients'));

DROP POLICY IF EXISTS permanent_clients_module_delete ON public.permanent_clients;
CREATE POLICY permanent_clients_module_delete ON public.permanent_clients
FOR DELETE TO authenticated
USING (public.has_permanent_client_module_access(id, 'clients'));

DROP POLICY IF EXISTS permanent_client_contacts_module_select ON public.permanent_client_contacts;
CREATE POLICY permanent_client_contacts_module_select ON public.permanent_client_contacts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.permanent_clients pc
    WHERE pc.id = permanent_client_contacts.client_id
      AND (
        public.has_permanent_client_module_access(pc.id, 'clients')
        OR public.has_permanent_client_module_access(pc.id, 'orders')
        OR public.has_permanent_client_module_access(pc.id, 'reminders')
      )
  )
);

DROP POLICY IF EXISTS permanent_client_contacts_module_all ON public.permanent_client_contacts;
CREATE POLICY permanent_client_contacts_module_all ON public.permanent_client_contacts
FOR ALL TO authenticated
USING (public.has_permanent_client_module_access(client_id, 'clients'))
WITH CHECK (public.has_permanent_client_module_access(client_id, 'clients'));

DROP POLICY IF EXISTS permanent_orders_module_all ON public.permanent_orders;
CREATE POLICY permanent_orders_module_all ON public.permanent_orders
FOR ALL TO authenticated
USING (public.has_permanent_client_module_access(client_id, 'orders'))
WITH CHECK (public.has_permanent_client_module_access(client_id, 'orders'));

DROP POLICY IF EXISTS permanent_reminders_module_select ON public.permanent_reminders;
CREATE POLICY permanent_reminders_module_select ON public.permanent_reminders
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.permanent_orders po
    WHERE po.id = permanent_reminders.order_id
      AND (
        public.has_permanent_client_module_access(po.client_id, 'reminders')
        OR public.has_permanent_client_module_access(po.client_id, 'orders')
      )
  )
);

DROP POLICY IF EXISTS permanent_reminders_module_all ON public.permanent_reminders;
CREATE POLICY permanent_reminders_module_all ON public.permanent_reminders
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.permanent_orders po
    WHERE po.id = permanent_reminders.order_id
      AND public.has_permanent_client_module_access(po.client_id, 'reminders')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.permanent_orders po
    WHERE po.id = permanent_reminders.order_id
      AND (
        public.has_permanent_client_module_access(po.client_id, 'reminders')
        OR public.has_permanent_client_module_access(po.client_id, 'orders')
      )
  )
);

-- Quotes and quote items.
DROP POLICY IF EXISTS quotes_module_all ON public.quotes;
CREATE POLICY quotes_module_all ON public.quotes
FOR ALL TO authenticated
USING (public.has_contractual_client_module_access(client_id, 'quotes'))
WITH CHECK (public.has_contractual_client_module_access(client_id, 'quotes'));

DROP POLICY IF EXISTS quotes_module_select ON public.quotes;
CREATE POLICY quotes_module_select ON public.quotes
FOR SELECT TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'quotes')
  OR public.has_contractual_client_module_access(client_id, 'sows')
);

DROP POLICY IF EXISTS quote_items_module_select ON public.quote_items;
CREATE POLICY quote_items_module_select ON public.quote_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND (
        public.has_contractual_client_module_access(q.client_id, 'quotes')
        OR public.has_contractual_client_module_access(q.client_id, 'sows')
      )
  )
);

DROP POLICY IF EXISTS quote_items_module_all ON public.quote_items;
CREATE POLICY quote_items_module_all ON public.quote_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND public.has_contractual_client_module_access(q.client_id, 'quotes')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND public.has_contractual_client_module_access(q.client_id, 'quotes')
  )
);

-- SOWs and SOW items. Cross-client linked SOWs remain visible when linked in sow_client_links.
DROP POLICY IF EXISTS sows_module_all ON public.sows;
CREATE POLICY sows_module_all ON public.sows
FOR ALL TO authenticated
USING (public.has_contractual_client_module_access(client_id, 'sows'))
WITH CHECK (public.has_contractual_client_module_access(client_id, 'sows'));

DROP POLICY IF EXISTS sows_module_select ON public.sows;
CREATE POLICY sows_module_select ON public.sows
FOR SELECT TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'sows')
  OR public.has_contractual_client_module_access(client_id, 'quotes')
  OR public.has_contractual_client_module_access(client_id, 'purchase_orders')
  OR public.has_contractual_client_module_access(client_id, 'rate_cards')
  OR EXISTS (
    SELECT 1 FROM public.sow_client_links scl
    WHERE scl.sow_id = sows.id
      AND (
        public.has_contractual_client_module_access(scl.linked_client_id, 'purchase_orders')
        OR public.has_contractual_client_module_access(scl.linked_client_id, 'rate_cards')
      )
  )
);

DROP POLICY IF EXISTS sow_items_module_select ON public.sow_items;
CREATE POLICY sow_items_module_select ON public.sow_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sows s
    WHERE s.id = sow_items.sow_id
      AND (
        public.has_contractual_client_module_access(s.client_id, 'sows')
        OR public.has_contractual_client_module_access(s.client_id, 'quotes')
        OR public.has_contractual_client_module_access(s.client_id, 'purchase_orders')
        OR public.has_contractual_client_module_access(s.client_id, 'rate_cards')
        OR EXISTS (
          SELECT 1 FROM public.sow_client_links scl
          WHERE scl.sow_id = s.id
            AND (
              public.has_contractual_client_module_access(scl.linked_client_id, 'purchase_orders')
              OR public.has_contractual_client_module_access(scl.linked_client_id, 'rate_cards')
            )
        )
      )
  )
);

DROP POLICY IF EXISTS sow_items_module_all ON public.sow_items;
CREATE POLICY sow_items_module_all ON public.sow_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sows s
    WHERE s.id = sow_items.sow_id
      AND public.has_contractual_client_module_access(s.client_id, 'sows')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sows s
    WHERE s.id = sow_items.sow_id
      AND public.has_contractual_client_module_access(s.client_id, 'sows')
  )
);

DROP POLICY IF EXISTS sow_client_links_module_select ON public.sow_client_links;
CREATE POLICY sow_client_links_module_select ON public.sow_client_links
FOR SELECT TO authenticated
USING (
  public.has_contractual_client_module_access(linked_client_id, 'purchase_orders')
  OR public.has_contractual_client_module_access(linked_client_id, 'rate_cards')
  OR EXISTS (
    SELECT 1 FROM public.sows s
    WHERE s.id = sow_client_links.sow_id
      AND public.has_contractual_client_module_access(s.client_id, 'sows')
  )
);

DROP POLICY IF EXISTS sow_client_links_module_all ON public.sow_client_links;
CREATE POLICY sow_client_links_module_all ON public.sow_client_links
FOR ALL TO authenticated
USING (public.has_contractual_client_module_access(linked_client_id, 'sows'))
WITH CHECK (public.has_contractual_client_module_access(linked_client_id, 'sows'));

-- Purchase orders and support tables.
DROP POLICY IF EXISTS purchase_orders_module_all ON public.purchase_orders;
CREATE POLICY purchase_orders_module_all ON public.purchase_orders
FOR ALL TO authenticated
USING (public.has_contractual_client_module_access(client_id, 'purchase_orders'))
WITH CHECK (public.has_contractual_client_module_access(client_id, 'purchase_orders'));

DROP POLICY IF EXISTS purchase_orders_module_select ON public.purchase_orders;
CREATE POLICY purchase_orders_module_select ON public.purchase_orders
FOR SELECT TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'purchase_orders')
  OR public.has_contractual_client_module_access(client_id, 'rate_cards')
);

DROP POLICY IF EXISTS po_consumption_log_module_all ON public.po_consumption_log;
CREATE POLICY po_consumption_log_module_all ON public.po_consumption_log
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = po_consumption_log.po_id
      AND public.has_contractual_client_module_access(po.client_id, 'purchase_orders')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = po_consumption_log.po_id
      AND public.has_contractual_client_module_access(po.client_id, 'purchase_orders')
  )
);

DROP POLICY IF EXISTS employee_po_history_module_all ON public.employee_po_history;
CREATE POLICY employee_po_history_module_all ON public.employee_po_history
FOR ALL TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'purchase_orders')
  OR public.has_contractual_client_module_access(client_id, 'rate_cards')
)
WITH CHECK (
  public.has_contractual_client_module_access(client_id, 'purchase_orders')
  OR public.has_contractual_client_module_access(client_id, 'rate_cards')
);

-- Rate cards. Attendance and Billing can read employee data for allowed clients.
DROP POLICY IF EXISTS rate_cards_module_all ON public.rate_cards;
CREATE POLICY rate_cards_module_all ON public.rate_cards
FOR ALL TO authenticated
USING (public.has_contractual_client_module_access(client_id, 'rate_cards'))
WITH CHECK (public.has_contractual_client_module_access(client_id, 'rate_cards'));

DROP POLICY IF EXISTS rate_cards_module_select ON public.rate_cards;
CREATE POLICY rate_cards_module_select ON public.rate_cards
FOR SELECT TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'rate_cards')
  OR public.has_contractual_client_module_access(client_id, 'attendance')
  OR public.has_contractual_client_module_access(client_id, 'billing')
);

DROP POLICY IF EXISTS rate_cards_module_update_leaves ON public.rate_cards;
CREATE POLICY rate_cards_module_update_leaves ON public.rate_cards
FOR UPDATE TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'rate_cards')
  OR public.has_contractual_client_module_access(client_id, 'attendance')
)
WITH CHECK (
  public.has_contractual_client_module_access(client_id, 'rate_cards')
  OR public.has_contractual_client_module_access(client_id, 'attendance')
);

-- Attendance is employee/month based, so module access remains aggregate.
DROP POLICY IF EXISTS attendance_module_all ON public.attendance;
CREATE POLICY attendance_module_all ON public.attendance
FOR ALL TO authenticated
USING (public.has_module_access('attendance') OR public.has_module_access('billing'))
WITH CHECK (public.has_module_access('attendance'));

-- Billing/service request run data is client-linked.
DROP POLICY IF EXISTS billing_runs_module_all ON public.billing_runs;
CREATE POLICY billing_runs_module_all ON public.billing_runs
FOR ALL TO authenticated
USING (public.has_contractual_client_module_access(client_id, 'billing'))
WITH CHECK (public.has_contractual_client_module_access(client_id, 'billing'));

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

DROP POLICY IF EXISTS sow_document_index_module_all ON public.sow_document_index;
CREATE POLICY sow_document_index_module_all ON public.sow_document_index
FOR ALL TO authenticated
USING (
  public.has_contractual_client_module_access(client_id, 'sows')
  OR EXISTS (
    SELECT 1 FROM public.sows s
    WHERE s.id = sow_document_index.sow_id
      AND public.has_contractual_client_module_access(s.client_id, 'sows')
  )
)
WITH CHECK (
  public.has_contractual_client_module_access(client_id, 'sows')
  OR EXISTS (
    SELECT 1 FROM public.sows s
    WHERE s.id = sow_document_index.sow_id
      AND public.has_contractual_client_module_access(s.client_id, 'sows')
  )
);
