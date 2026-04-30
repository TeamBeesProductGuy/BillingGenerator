ALTER TABLE permanent_clients
DROP CONSTRAINT IF EXISTS permanent_clients_billing_pattern_check;

UPDATE permanent_clients
SET billing_pattern = CASE
  WHEN billing_pattern = 'Weekly' THEN '7 days'
  WHEN billing_pattern = 'Monthly' THEN '30 days'
  WHEN billing_pattern = 'Quarterly' THEN '90 days'
  ELSE billing_pattern
END;

ALTER TABLE permanent_clients
ADD CONSTRAINT permanent_clients_billing_pattern_check
CHECK (billing_pattern IN ('Immediate', '7 days', '30 days', '60 days', '90 days'));
