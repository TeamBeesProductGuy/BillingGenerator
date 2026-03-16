-- ============================================================
-- TeamBees Billing Engine - Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
    id              SERIAL PRIMARY KEY,
    client_name     TEXT NOT NULL UNIQUE,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_cards (
    id                SERIAL PRIMARY KEY,
    client_id         INTEGER NOT NULL REFERENCES clients(id),
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    doj               TEXT,
    reporting_manager TEXT,
    monthly_rate      NUMERIC(15,2) NOT NULL CHECK(monthly_rate > 0),
    leaves_allowed    INTEGER NOT NULL DEFAULT 0 CHECK(leaves_allowed >= 0),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id, emp_code)
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_client ON rate_cards(client_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_emp_code ON rate_cards(emp_code);

CREATE TABLE IF NOT EXISTS attendance (
    id                SERIAL PRIMARY KEY,
    emp_code          TEXT NOT NULL,
    emp_name          TEXT,
    reporting_manager TEXT,
    billing_month     TEXT NOT NULL,
    day_number        INTEGER NOT NULL CHECK(day_number >= 1 AND day_number <= 31),
    status            TEXT NOT NULL CHECK(status IN ('P', 'L')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(emp_code, billing_month, day_number)
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_month ON attendance(emp_code, billing_month);

CREATE TABLE IF NOT EXISTS billing_runs (
    id              SERIAL PRIMARY KEY,
    billing_month   TEXT NOT NULL,
    client_id       INTEGER REFERENCES clients(id),
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
    gst_percent     NUMERIC(5,2) NOT NULL DEFAULT 18,
    gst_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_with_gst  NUMERIC(15,2) NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    output_file     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_items (
    id                SERIAL PRIMARY KEY,
    billing_run_id    INTEGER NOT NULL REFERENCES billing_runs(id) ON DELETE CASCADE,
    client_name       TEXT NOT NULL,
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    reporting_manager TEXT,
    monthly_rate      NUMERIC(15,2) NOT NULL,
    leaves_allowed    INTEGER NOT NULL DEFAULT 0,
    leaves_taken      INTEGER NOT NULL DEFAULT 0,
    days_in_month     INTEGER NOT NULL,
    chargeable_days   NUMERIC(10,2) NOT NULL,
    invoice_amount    NUMERIC(15,2) NOT NULL,
    gst_percent       NUMERIC(5,2) NOT NULL DEFAULT 18,
    gst_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_with_gst    NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_items_run ON billing_items(billing_run_id);

CREATE TABLE IF NOT EXISTS billing_errors (
    id              SERIAL PRIMARY KEY,
    billing_run_id  INTEGER NOT NULL REFERENCES billing_runs(id) ON DELETE CASCADE,
    emp_code        TEXT,
    error_message   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_errors_run ON billing_errors(billing_run_id);

CREATE TABLE IF NOT EXISTS quotes (
    id              SERIAL PRIMARY KEY,
    quote_number    TEXT NOT NULL UNIQUE,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    quote_date      TEXT NOT NULL,
    valid_until     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired')),
    subtotal        NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_percent     NUMERIC(5,2) NOT NULL DEFAULT 18,
    tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_items (
    id              SERIAL PRIMARY KEY,
    quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_rate       NUMERIC(15,2) NOT NULL,
    amount          NUMERIC(15,2) NOT NULL,
    emp_code        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              SERIAL PRIMARY KEY,
    po_number       TEXT NOT NULL UNIQUE,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    quote_id        INTEGER REFERENCES quotes(id),
    po_date         TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    po_value        NUMERIC(15,2) NOT NULL CHECK(po_value > 0),
    consumed_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Expired', 'Exhausted', 'Renewed', 'Cancelled')),
    alert_threshold NUMERIC(5,2) NOT NULL DEFAULT 80,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_client ON purchase_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS po_consumption_log (
    id              SERIAL PRIMARY KEY,
    po_id           INTEGER NOT NULL REFERENCES purchase_orders(id),
    billing_run_id  INTEGER REFERENCES billing_runs(id),
    amount          NUMERIC(15,2) NOT NULL,
    description     TEXT,
    consumed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_consumption_po ON po_consumption_log(po_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id              SERIAL PRIMARY KEY,
    user_action     TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    old_values      JSONB,
    new_values      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(user_action);

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW rate_cards_view AS
SELECT rc.*, c.client_name
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id;

CREATE OR REPLACE VIEW quotes_view AS
SELECT q.*, c.client_name
FROM quotes q
JOIN clients c ON q.client_id = c.id;

CREATE OR REPLACE VIEW purchase_orders_view AS
SELECT po.*, c.client_name,
  CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct,
  ROUND(po.po_value - po.consumed_value, 2) AS remaining_value
FROM purchase_orders po
JOIN clients c ON po.client_id = c.id;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Get attendance summary grouped by employee for a billing month
CREATE OR REPLACE FUNCTION get_attendance_summary(p_billing_month TEXT)
RETURNS TABLE (
  emp_code TEXT,
  emp_name TEXT,
  reporting_manager TEXT,
  leaves_taken BIGINT,
  days_present BIGINT,
  total_days BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    a.emp_code,
    a.emp_name,
    a.reporting_manager,
    SUM(CASE WHEN a.status = 'L' THEN 1 ELSE 0 END) AS leaves_taken,
    SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) AS days_present,
    COUNT(*) AS total_days
  FROM attendance a
  WHERE a.billing_month = p_billing_month
  GROUP BY a.emp_code, a.emp_name, a.reporting_manager
  ORDER BY a.emp_code;
$$;

-- Consume PO value (transaction: insert log + update PO + check exhausted)
CREATE OR REPLACE FUNCTION consume_po(
  p_po_id INTEGER,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_billing_run_id INTEGER DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_po RECORD;
BEGIN
  INSERT INTO po_consumption_log (po_id, billing_run_id, amount, description)
  VALUES (p_po_id, p_billing_run_id, p_amount, p_description);

  UPDATE purchase_orders
  SET consumed_value = consumed_value + p_amount, updated_at = NOW()
  WHERE id = p_po_id;

  SELECT po_value, consumed_value INTO v_po
  FROM purchase_orders WHERE id = p_po_id;

  IF v_po.consumed_value >= v_po.po_value THEN
    UPDATE purchase_orders SET status = 'Exhausted', updated_at = NOW()
    WHERE id = p_po_id;
  END IF;
END;
$$;

-- Renew PO (transaction: mark old as Renewed + insert new)
CREATE OR REPLACE FUNCTION renew_po(
  p_old_id INTEGER,
  p_po_number TEXT,
  p_client_id INTEGER,
  p_po_date TEXT,
  p_start_date TEXT,
  p_end_date TEXT,
  p_po_value NUMERIC,
  p_alert_threshold NUMERIC DEFAULT 80,
  p_notes TEXT DEFAULT NULL
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_id INTEGER;
BEGIN
  UPDATE purchase_orders SET status = 'Renewed', updated_at = NOW()
  WHERE id = p_old_id;

  INSERT INTO purchase_orders (po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, notes)
  VALUES (p_po_number, p_client_id, p_po_date, p_start_date, p_end_date, p_po_value, p_alert_threshold, p_notes)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Get PO alerts (consumption threshold exceeded or expiring within 30 days)
CREATE OR REPLACE FUNCTION get_po_alerts()
RETURNS TABLE (
  id INTEGER,
  po_number TEXT,
  client_name TEXT,
  po_value NUMERIC,
  consumed_value NUMERIC,
  end_date TEXT,
  alert_threshold NUMERIC,
  consumption_pct NUMERIC
) LANGUAGE sql STABLE AS $$
  SELECT
    po.id,
    po.po_number,
    c.client_name,
    po.po_value,
    po.consumed_value,
    po.end_date,
    po.alert_threshold,
    CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct
  FROM purchase_orders po
  JOIN clients c ON po.client_id = c.id
  WHERE po.status = 'Active'
    AND (
      (CASE WHEN po.po_value > 0 THEN (po.consumed_value / po.po_value) * 100 ELSE 0 END) >= po.alert_threshold
      OR po.end_date::date <= CURRENT_DATE + INTERVAL '30 days'
    );
$$;

-- Check and update expired POs
CREATE OR REPLACE FUNCTION check_and_update_expired_pos()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE purchase_orders
  SET status = 'Expired', updated_at = NOW()
  WHERE status = 'Active' AND end_date::date < CURRENT_DATE;
END;
$$;

-- Get dashboard stats in one call
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSON;
  v_clients BIGINT;
  v_employees BIGINT;
  v_active_pos BIGINT;
  v_billing_runs BIGINT;
  v_pending_quotes BIGINT;
  v_recent_runs JSON;
  v_po_alerts JSON;
BEGIN
  SELECT COUNT(*) INTO v_clients FROM clients WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_employees FROM rate_cards WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_active_pos FROM purchase_orders WHERE status = 'Active';
  SELECT COUNT(*) INTO v_billing_runs FROM billing_runs;
  SELECT COUNT(*) INTO v_pending_quotes FROM quotes WHERE status = 'Draft';

  SELECT COALESCE(json_agg(r), '[]'::json) INTO v_recent_runs
  FROM (
    SELECT id, billing_month, total_employees, total_amount, error_count, created_at
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
      'billingRuns', v_billing_runs,
      'pendingQuotes', v_pending_quotes
    ),
    'recentRuns', v_recent_runs,
    'poAlerts', v_po_alerts
  );

  RETURN v_result;
END;
$$;
