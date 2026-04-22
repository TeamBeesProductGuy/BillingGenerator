-- Add GST fields to billing tables

ALTER TABLE billing_runs ADD COLUMN gst_percent REAL NOT NULL DEFAULT 18;
ALTER TABLE billing_runs ADD COLUMN gst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE billing_runs ADD COLUMN total_with_gst REAL NOT NULL DEFAULT 0;

ALTER TABLE billing_items ADD COLUMN gst_percent REAL NOT NULL DEFAULT 18;
ALTER TABLE billing_items ADD COLUMN gst_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE billing_items ADD COLUMN total_with_gst REAL NOT NULL DEFAULT 0;

-- Audit trail table
CREATE TABLE IF NOT EXISTS audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_action     TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    old_values      TEXT,
    new_values      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(user_action);
