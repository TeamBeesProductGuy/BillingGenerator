-- SOW folder search index

CREATE TABLE IF NOT EXISTS sow_document_index (
    id                  SERIAL PRIMARY KEY,
    folder_name         TEXT NOT NULL UNIQUE,
    quote_id            INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
    client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    client_abbreviation TEXT,
    candidate_name      TEXT,
    sow_numbers         JSONB NOT NULL DEFAULT '[]'::jsonb,
    roles               JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sow_document_index_quote ON sow_document_index(quote_id);
CREATE INDEX IF NOT EXISTS idx_sow_document_index_client ON sow_document_index(client_id);
