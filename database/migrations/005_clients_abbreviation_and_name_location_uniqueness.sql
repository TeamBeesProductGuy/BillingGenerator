ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS abbreviation TEXT;

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_client_name_key;

DROP INDEX IF EXISTS idx_clients_unique_name_location_active;

CREATE UNIQUE INDEX idx_clients_unique_name_location_active
ON clients (LOWER(client_name), LOWER(COALESCE(address, '')))
WHERE is_active = TRUE;
