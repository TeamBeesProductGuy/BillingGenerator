ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS base_quote_number TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_quote_id INTEGER REFERENCES quotes(id),
  ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE quotes
SET base_quote_number = quote_number
WHERE base_quote_number IS NULL;

ALTER TABLE sows
  ADD COLUMN IF NOT EXISTS base_sow_number TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_sow_id INTEGER REFERENCES sows(id),
  ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE sows
SET base_sow_number = sow_number
WHERE base_sow_number IS NULL;

ALTER TABLE rate_cards
  ADD COLUMN IF NOT EXISTS sow_id INTEGER REFERENCES sows(id);

ALTER TABLE billing_runs
  ADD COLUMN IF NOT EXISTS request_status TEXT NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumption_applied_at TIMESTAMPTZ;

ALTER TABLE billing_items
  ADD COLUMN IF NOT EXISTS effective_days INTEGER,
  ADD COLUMN IF NOT EXISTS charging_date TEXT,
  ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES purchase_orders(id);

UPDATE sows
SET status = 'Signed'
WHERE status = 'Active';

ALTER TABLE sows DROP CONSTRAINT IF EXISTS sows_status_check;
ALTER TABLE sows
  ADD CONSTRAINT sows_status_check CHECK (status IN ('Draft', 'Signed', 'Expired', 'Terminated'));

ALTER TABLE billing_runs DROP CONSTRAINT IF EXISTS billing_runs_request_status_check;
ALTER TABLE billing_runs
  ADD CONSTRAINT billing_runs_request_status_check CHECK (request_status IN ('Pending', 'Accepted', 'Rejected'));

CREATE INDEX IF NOT EXISTS idx_quotes_latest ON quotes(is_latest);
CREATE INDEX IF NOT EXISTS idx_sows_latest ON sows(is_latest);
CREATE INDEX IF NOT EXISTS idx_rate_cards_sow ON rate_cards(sow_id);
CREATE INDEX IF NOT EXISTS idx_billing_runs_status ON billing_runs(request_status);
CREATE INDEX IF NOT EXISTS idx_billing_items_po ON billing_items(po_id);

CREATE OR REPLACE VIEW rate_cards_view AS
SELECT rc.*, c.client_name, po.po_number, sw.sow_number
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id
LEFT JOIN sows sw ON rc.sow_id = sw.id;

CREATE OR REPLACE VIEW quotes_view AS
SELECT q.*, c.client_name
FROM quotes q
JOIN clients c ON q.client_id = c.id;

CREATE OR REPLACE VIEW sows_view AS
SELECT s.*, c.client_name
FROM sows s
JOIN clients c ON s.client_id = c.id;

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSON;
  v_clients BIGINT;
  v_employees BIGINT;
  v_active_pos BIGINT;
  v_active_sows BIGINT;
  v_billing_runs BIGINT;
  v_pending_quotes BIGINT;
  v_recent_runs JSON;
  v_po_alerts JSON;
BEGIN
  SELECT COUNT(*) INTO v_clients FROM clients WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_employees FROM rate_cards WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_active_pos FROM purchase_orders WHERE status = 'Active';
  SELECT COUNT(*) INTO v_active_sows FROM sows WHERE status = 'Signed';
  SELECT COUNT(*) INTO v_billing_runs FROM billing_runs;
  SELECT COUNT(*) INTO v_pending_quotes FROM quotes WHERE status = 'Draft' AND is_latest = TRUE;

  SELECT COALESCE(json_agg(r), '[]'::json) INTO v_recent_runs
  FROM (
    SELECT id, billing_month, total_employees, total_amount, error_count, request_status, created_at
    FROM billing_runs ORDER BY created_at DESC LIMIT 5
  ) r;

  SELECT COALESCE(json_agg(a), '[]'::json) INTO v_po_alerts
  FROM (
    SELECT po.id, po.po_number, c.client_name, po.po_value, po.consumed_value, po.end_date, po.alert_threshold,
      CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct
    FROM purchase_orders po JOIN clients c ON po.client_id = c.id
    WHERE po.status = 'Active'
      AND (
        (CASE WHEN po.po_value > 0 THEN (po.consumed_value / po.po_value) * 100 ELSE 0 END) >= po.alert_threshold
        OR po.end_date::date <= CURRENT_DATE + INTERVAL '30 days'
      )
  ) a;

  v_result := json_build_object(
    'counts', json_build_object(
      'clients', v_clients,
      'employees', v_employees,
      'activePOs', v_active_pos,
      'activeSOWs', v_active_sows,
      'billingRuns', v_billing_runs,
      'pendingQuotes', v_pending_quotes
    ),
    'recentRuns', v_recent_runs,
    'poAlerts', v_po_alerts
  );

  RETURN v_result;
END;
$$;
