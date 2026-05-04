-- Link each rate card to the exact SOW item selected in the UI.
-- This disambiguates duplicate role/position names with different amounts.

ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS sow_item_id INTEGER REFERENCES sow_items(id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_sow_item ON rate_cards(sow_item_id);

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
