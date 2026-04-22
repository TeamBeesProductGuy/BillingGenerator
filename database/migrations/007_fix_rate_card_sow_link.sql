-- Fix: ensure rate cards persist SOW linkage
-- Run in Supabase SQL Editor

ALTER TABLE rate_cards
  ADD COLUMN IF NOT EXISTS sow_id INTEGER REFERENCES sows(id);

CREATE INDEX IF NOT EXISTS idx_rate_cards_sow ON rate_cards(sow_id);

CREATE OR REPLACE VIEW rate_cards_view AS
SELECT rc.*, c.client_name, po.po_number, sw.sow_number
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id
LEFT JOIN sows sw ON rc.sow_id = sw.id;

