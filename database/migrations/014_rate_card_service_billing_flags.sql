-- Rate card service description and no-invoice billing controls.

ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS service_description TEXT;
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS billing_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS no_invoice BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE VIEW rate_cards_view
WITH (security_invoker = true) AS
SELECT rc.*, c.client_name, po.po_number, sw.sow_number
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id
LEFT JOIN sows sw ON rc.sow_id = sw.id;

CREATE OR REPLACE VIEW purchase_orders_view
WITH (security_invoker = true) AS
SELECT po.*, c.client_name, sw.sow_number,
  CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct,
  ROUND(po.po_value - po.consumed_value, 2) AS remaining_value,
  (SELECT COUNT(*) FROM rate_cards rc WHERE rc.po_id = po.id AND rc.is_active = TRUE AND rc.billing_active = TRUE AND rc.no_invoice = FALSE) AS linked_employees
FROM purchase_orders po
JOIN clients c ON po.client_id = c.id
LEFT JOIN sows sw ON po.sow_id = sw.id;

GRANT SELECT ON rate_cards_view TO authenticated;
GRANT SELECT ON purchase_orders_view TO authenticated;
