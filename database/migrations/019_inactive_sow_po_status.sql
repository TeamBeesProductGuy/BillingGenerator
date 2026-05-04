-- Add reversible Inactive status for SOWs and purchase orders.
-- Inactive SOWs/POs remain in registers but are excluded from new linking and billing.

ALTER TABLE sows DROP CONSTRAINT IF EXISTS sows_status_check;
ALTER TABLE sows DROP CONSTRAINT IF EXISTS sows_status_check1;
ALTER TABLE sows
  ADD CONSTRAINT sows_status_check
  CHECK (status IN ('Draft', 'Active', 'Signed', 'Inactive', 'Expired', 'Terminated', 'Amendment Draft'));

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check1;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('Active', 'Inactive', 'Expired', 'Exhausted', 'Renewed', 'Cancelled'));

CREATE OR REPLACE VIEW rate_cards_view
WITH (security_invoker = true) AS
SELECT
  rc.*,
  c.client_name,
  c.abbreviation AS client_abbreviation,
  c.leaves_allowed AS client_leaves_allowed,
  po.po_number,
  po.po_date,
  po.status AS po_status,
  sw.sow_number,
  sw.status AS sow_status,
  si.role_position AS sow_item_role_position,
  si.amount AS sow_item_amount,
  si.quantity AS sow_item_quantity
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id
LEFT JOIN sows sw ON rc.sow_id = sw.id
LEFT JOIN sow_items si ON rc.sow_item_id = si.id;

GRANT SELECT ON rate_cards_view TO authenticated;
