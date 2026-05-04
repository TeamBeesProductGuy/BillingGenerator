CREATE TABLE IF NOT EXISTS activity_logs (
    id            SERIAL PRIMARY KEY,
    owner_user_id UUID NOT NULL DEFAULT auth.uid(),
    user_email    TEXT,
    module        TEXT NOT NULL,
    action        TEXT NOT NULL,
    entity_type   TEXT,
    entity_id     TEXT,
    entity_label  TEXT,
    details       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_owner_user ON activity_logs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module_action ON activity_logs(module, action);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_owner_select ON activity_logs;
DROP POLICY IF EXISTS activity_logs_owner_insert ON activity_logs;

CREATE POLICY activity_logs_owner_select
ON activity_logs
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY activity_logs_owner_insert
ON activity_logs
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());
