-- Allow unpaid employees to remain in rate cards and generate zero billing/PO deduction.

ALTER TABLE rate_cards DROP CONSTRAINT IF EXISTS rate_cards_monthly_rate_check;
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_monthly_rate_check CHECK (monthly_rate >= 0);
