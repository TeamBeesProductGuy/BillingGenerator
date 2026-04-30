CREATE TABLE IF NOT EXISTS sow_client_links (
    id                SERIAL PRIMARY KEY,
    sow_id            INTEGER NOT NULL REFERENCES sows(id) ON DELETE CASCADE,
    linked_client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sow_id, linked_client_id)
);

CREATE INDEX IF NOT EXISTS idx_sow_client_links_sow ON sow_client_links(sow_id);
CREATE INDEX IF NOT EXISTS idx_sow_client_links_client ON sow_client_links(linked_client_id);

ALTER TABLE sow_client_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_po_sow_client()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_sow_client_id INTEGER;
    v_link_exists INTEGER;
BEGIN
    IF NEW.sow_id IS NOT NULL THEN
        SELECT client_id INTO v_sow_client_id
        FROM sows
        WHERE id = NEW.sow_id;

        IF v_sow_client_id IS NULL THEN
            RAISE EXCEPTION 'SOW % not found', NEW.sow_id;
        END IF;

        IF v_sow_client_id != NEW.client_id THEN
            SELECT 1 INTO v_link_exists
            FROM sow_client_links
            WHERE sow_id = NEW.sow_id
              AND linked_client_id = NEW.client_id
            LIMIT 1;

            IF v_link_exists IS NULL THEN
                RAISE EXCEPTION 'SOW belongs to a different client';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_sow_client ON purchase_orders;

CREATE TRIGGER trg_po_sow_client
BEFORE INSERT OR UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION check_po_sow_client();
