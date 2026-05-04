-- Add role-level duration on SOW line items and expose it in rate cards.
-- Existing SOW items are backfilled from their parent SOW effective dates.

ALTER TABLE sow_items ADD COLUMN IF NOT EXISTS valid_from TEXT;
ALTER TABLE sow_items ADD COLUMN IF NOT EXISTS valid_to TEXT;

UPDATE sow_items si
SET
  valid_from = COALESCE(si.valid_from, s.effective_start),
  valid_to = COALESCE(si.valid_to, s.effective_end)
FROM sows s
WHERE si.sow_id = s.id
  AND (si.valid_from IS NULL OR si.valid_to IS NULL);

CREATE INDEX IF NOT EXISTS idx_sow_items_duration ON sow_items(valid_from, valid_to);

CREATE OR REPLACE VIEW rate_cards_view
WITH (security_invoker = true) AS
SELECT
  rc.*,
  c.client_name,
  c.abbreviation AS client_abbreviation,
  c.leaves_allowed AS client_leaves_allowed,
  po.po_number,
  po.po_date,
  sw.sow_number,
  si.role_position AS sow_item_role_position,
  si.amount AS sow_item_amount,
  si.quantity AS sow_item_quantity,
  po.status AS po_status,
  sw.status AS sow_status,
  si.valid_from AS sow_item_valid_from,
  si.valid_to AS sow_item_valid_to
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id
LEFT JOIN sows sw ON rc.sow_id = sw.id
LEFT JOIN sow_items si ON rc.sow_item_id = si.id;

GRANT SELECT ON rate_cards_view TO authenticated;
