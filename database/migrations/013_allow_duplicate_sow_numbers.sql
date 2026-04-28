ALTER TABLE sows DROP CONSTRAINT IF EXISTS sows_sow_number_key;

DROP INDEX IF EXISTS sows_sow_number_key;

CREATE INDEX IF NOT EXISTS idx_sows_sow_number ON sows(sow_number);
