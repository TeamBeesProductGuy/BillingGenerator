-- Optional metadata for correctly scoping and displaying service request errors by client.
-- The app falls back if these columns are missing, but adding them preserves
-- client abbreviation/name in saved error reports.

ALTER TABLE billing_errors ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
ALTER TABLE billing_errors ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE billing_errors ADD COLUMN IF NOT EXISTS client_abbreviation TEXT;

CREATE INDEX IF NOT EXISTS idx_billing_errors_client ON billing_errors(client_id);
