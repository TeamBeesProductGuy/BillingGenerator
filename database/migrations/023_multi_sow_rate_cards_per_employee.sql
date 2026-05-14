-- Allow the same employee/client to have separate rate-card rows for different
-- SOW line items. This supports monthly service requests that split billing
-- across non-overlapping SOW role durations.

ALTER TABLE rate_cards
  DROP CONSTRAINT IF EXISTS rate_cards_client_id_emp_code_key;

ALTER TABLE rate_cards
  DROP CONSTRAINT IF EXISTS rate_cards_client_emp_sow_item_key;

ALTER TABLE rate_cards
  DROP CONSTRAINT IF EXISTS rate_cards_client_emp_sow_sow_item_key;

ALTER TABLE rate_cards
  ADD CONSTRAINT rate_cards_client_emp_sow_sow_item_key
  UNIQUE NULLS NOT DISTINCT (client_id, emp_code, sow_id, sow_item_id);

CREATE INDEX IF NOT EXISTS idx_rate_cards_client_emp_active
ON rate_cards(client_id, emp_code)
WHERE is_active = TRUE;
