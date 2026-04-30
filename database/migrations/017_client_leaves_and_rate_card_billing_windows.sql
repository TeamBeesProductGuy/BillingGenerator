ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS leaves_allowed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_leaves_allowed_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_leaves_allowed_check CHECK (leaves_allowed >= 0);

ALTER TABLE rate_cards
  ADD COLUMN IF NOT EXISTS pause_billing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pause_start_date TEXT,
  ADD COLUMN IF NOT EXISTS pause_end_date TEXT,
  ADD COLUMN IF NOT EXISTS disable_billing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disable_from_date TEXT;

ALTER TABLE billing_items
  ADD COLUMN IF NOT EXISTS service_description TEXT,
  ADD COLUMN IF NOT EXISTS po_number TEXT,
  ADD COLUMN IF NOT EXISTS po_date TEXT,
  ADD COLUMN IF NOT EXISTS days_present NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS billing_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS billing_method TEXT,
  ADD COLUMN IF NOT EXISTS billing_status TEXT,
  ADD COLUMN IF NOT EXISTS billing_note TEXT;

CREATE OR REPLACE VIEW rate_cards_view
WITH (security_invoker = true) AS
SELECT
  rc.*,
  c.client_name,
  c.abbreviation AS client_abbreviation,
  c.leaves_allowed AS client_leaves_allowed,
  po.po_number,
  po.po_date,
  sw.sow_number
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id
LEFT JOIN sows sw ON rc.sow_id = sw.id;

CREATE OR REPLACE VIEW purchase_orders_view
WITH (security_invoker = true) AS
SELECT po.*, c.client_name, sw.sow_number,
  CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct,
  ROUND(po.po_value - po.consumed_value, 2) AS remaining_value,
  (SELECT COUNT(*) FROM rate_cards rc WHERE rc.po_id = po.id AND rc.is_active = TRUE AND rc.billing_active = TRUE AND rc.no_invoice = FALSE AND rc.disable_billing = FALSE) AS linked_employees
FROM purchase_orders po
JOIN clients c ON po.client_id = c.id
LEFT JOIN sows sw ON po.sow_id = sw.id;

GRANT SELECT ON rate_cards_view TO authenticated;
GRANT SELECT ON purchase_orders_view TO authenticated;
