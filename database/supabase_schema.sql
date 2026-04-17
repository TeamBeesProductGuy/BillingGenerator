-- ============================================================
-- TeamBees Billing Engine - Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
    id              SERIAL PRIMARY KEY,
    client_name     TEXT NOT NULL,
    abbreviation    TEXT,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    industry        TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_name_location_active
ON clients (LOWER(client_name), LOWER(COALESCE(address, '')))
WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS permanent_clients (
    id              SERIAL PRIMARY KEY,
    client_name     TEXT NOT NULL,
    abbreviation    TEXT,
    address         TEXT,
    billing_address TEXT,
    billing_pattern TEXT NOT NULL CHECK(billing_pattern IN ('Weekly', 'Monthly', 'Quarterly')),
    billing_rate    NUMERIC(10,2) NOT NULL CHECK(billing_rate > 0 AND billing_rate <= 100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permanent_clients_unique_name_location_active
ON permanent_clients (LOWER(client_name), LOWER(COALESCE(address, '')))
WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS permanent_client_contacts (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER NOT NULL REFERENCES permanent_clients(id) ON DELETE CASCADE,
    contact_name    TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    designation     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permanent_contacts_client ON permanent_client_contacts(client_id);

CREATE TABLE IF NOT EXISTS permanent_orders (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER NOT NULL REFERENCES permanent_clients(id),
    candidate_name  TEXT NOT NULL,
    requisition_description TEXT,
    position_role   TEXT NOT NULL,
    date_of_offer   TEXT,
    date_of_joining TEXT NOT NULL,
    ctc_offered     NUMERIC(15,2) NOT NULL CHECK(ctc_offered > 0),
    bill_amount     NUMERIC(15,2) NOT NULL CHECK(bill_amount >= 0),
    next_bill_date  TEXT NOT NULL,
    remarks         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permanent_orders_client ON permanent_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_permanent_orders_next_bill_date ON permanent_orders(next_bill_date);

CREATE TABLE IF NOT EXISTS permanent_reminders (
    id               SERIAL PRIMARY KEY,
    order_id         INTEGER NOT NULL REFERENCES permanent_orders(id) ON DELETE CASCADE,
    due_date         TEXT NOT NULL,
    email_primary    TEXT,
    email_secondary  TEXT,
    payment_status   TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
    invoice_status   TEXT NOT NULL DEFAULT 'pending' CHECK (invoice_status IN ('pending', 'sent')),
    invoice_number   TEXT,
    invoice_date     TEXT,
    invoice_sent_at  TIMESTAMPTZ,
    status           TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Closed')),
    closed_at        TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    next_reminder_at TIMESTAMPTZ,
    reminder_count   INTEGER NOT NULL DEFAULT 0,
    mail_last_status TEXT,
    mail_last_error  TEXT,
    extended_count   INTEGER NOT NULL DEFAULT 0,
    last_extended_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permanent_reminders_order_open
ON permanent_reminders(order_id)
WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS idx_permanent_reminders_due_date ON permanent_reminders(due_date);

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

CREATE TABLE IF NOT EXISTS rate_cards (
    id                SERIAL PRIMARY KEY,
    client_id         INTEGER NOT NULL REFERENCES clients(id),
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    doj               TEXT,
    reporting_manager TEXT,
    monthly_rate      NUMERIC(15,2) NOT NULL CHECK(monthly_rate > 0),
    leaves_allowed    INTEGER NOT NULL DEFAULT 0 CHECK(leaves_allowed >= 0),
    charging_date     TEXT,
    po_id             INTEGER REFERENCES purchase_orders(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id, emp_code)
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_client ON rate_cards(client_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_emp_code ON rate_cards(emp_code);
CREATE INDEX IF NOT EXISTS idx_rate_cards_po ON rate_cards(po_id);

CREATE TABLE IF NOT EXISTS attendance (
    id                SERIAL PRIMARY KEY,
    emp_code          TEXT NOT NULL,
    emp_name          TEXT,
    reporting_manager TEXT,
    billing_month     TEXT NOT NULL,
    day_number        INTEGER NOT NULL CHECK(day_number >= 1 AND day_number <= 31),
    status            TEXT NOT NULL CHECK(status IN ('P', 'L')),
    leave_units       NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK(
                      (status = 'P' AND leave_units = 0)
                      OR (status = 'L' AND leave_units IN (0.5, 1))
                    ),
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
    leaves_taken      NUMERIC(10,2) NOT NULL DEFAULT 0,
    days_in_month     INTEGER NOT NULL,
    chargeable_days   NUMERIC(10,2) NOT NULL,
    invoice_amount    NUMERIC(15,2) NOT NULL,
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
    location        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

CREATE TABLE IF NOT EXISTS sows (
    id              SERIAL PRIMARY KEY,
    sow_number      TEXT NOT NULL UNIQUE,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    quote_id        INTEGER REFERENCES quotes(id),
    sow_date        TEXT NOT NULL,
    effective_start TEXT NOT NULL,
    effective_end   TEXT NOT NULL,
    total_value     NUMERIC(15,2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Active', 'Expired', 'Terminated', 'Amendment Draft')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sow_items (
    id              SERIAL PRIMARY KEY,
    sow_id          INTEGER NOT NULL REFERENCES sows(id) ON DELETE CASCADE,
    role_position   TEXT NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    amount          NUMERIC(15,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sow_items_sow ON sow_items(sow_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              SERIAL PRIMARY KEY,
    po_number       TEXT NOT NULL UNIQUE,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    quote_id        INTEGER REFERENCES quotes(id),
    sow_id          INTEGER REFERENCES sows(id),
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

CREATE TABLE IF NOT EXISTS employee_po_history (
    id              SERIAL PRIMARY KEY,
    rate_card_id    INTEGER NOT NULL REFERENCES rate_cards(id),
    po_id           INTEGER NOT NULL REFERENCES purchase_orders(id),
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    assigned_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_date TIMESTAMPTZ,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_emp_po_history_rc ON employee_po_history(rate_card_id);
CREATE INDEX IF NOT EXISTS idx_emp_po_history_po ON employee_po_history(po_id);

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
SELECT rc.*, c.client_name, po.po_number
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id;

CREATE OR REPLACE VIEW quotes_view AS
SELECT q.*, c.client_name
FROM quotes q
JOIN clients c ON q.client_id = c.id;

CREATE OR REPLACE VIEW sows_view AS
SELECT s.*, c.client_name
FROM sows s
JOIN clients c ON s.client_id = c.id;

CREATE OR REPLACE VIEW purchase_orders_view AS
SELECT po.*, c.client_name, sw.sow_number,
  CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct,
  ROUND(po.po_value - po.consumed_value, 2) AS remaining_value,
  (SELECT COUNT(*) FROM rate_cards rc WHERE rc.po_id = po.id AND rc.is_active = TRUE) AS linked_employees
FROM purchase_orders po
JOIN clients c ON po.client_id = c.id
LEFT JOIN sows sw ON po.sow_id = sw.id;

-- ============================================================
-- USER ISOLATION AND RLS
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE permanent_clients ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE permanent_client_contacts ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE permanent_orders ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE permanent_reminders ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE sow_document_index ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE billing_errors ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE sows ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE sow_items ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE po_consumption_log ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE employee_po_history ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS owner_user_id UUID NOT NULL DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_clients_owner_user ON clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_permanent_clients_owner_user ON permanent_clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_permanent_client_contacts_owner_user ON permanent_client_contacts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_permanent_orders_owner_user ON permanent_orders(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_permanent_reminders_owner_user ON permanent_reminders(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sow_document_index_owner_user ON sow_document_index(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_owner_user ON rate_cards(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_owner_user ON attendance(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_billing_runs_owner_user ON billing_runs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_billing_items_owner_user ON billing_items(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_billing_errors_owner_user ON billing_errors(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_owner_user ON quotes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_owner_user ON quote_items(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sows_owner_user ON sows(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sow_items_owner_user ON sow_items(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_owner_user ON purchase_orders(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_po_consumption_log_owner_user ON po_consumption_log(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_employee_po_history_owner_user ON employee_po_history(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_owner_user ON audit_log(owner_user_id);

CREATE OR REPLACE VIEW rate_cards_view
WITH (security_invoker = true) AS
SELECT rc.*, c.client_name, po.po_number
FROM rate_cards rc
JOIN clients c ON rc.client_id = c.id
LEFT JOIN purchase_orders po ON rc.po_id = po.id;

CREATE OR REPLACE VIEW quotes_view
WITH (security_invoker = true) AS
SELECT q.*, c.client_name
FROM quotes q
JOIN clients c ON q.client_id = c.id;

CREATE OR REPLACE VIEW sows_view
WITH (security_invoker = true) AS
SELECT s.*, c.client_name
FROM sows s
JOIN clients c ON s.client_id = c.id;

CREATE OR REPLACE VIEW purchase_orders_view
WITH (security_invoker = true) AS
SELECT po.*, c.client_name, sw.sow_number,
  CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END AS consumption_pct,
  ROUND(po.po_value - po.consumed_value, 2) AS remaining_value,
  (SELECT COUNT(*) FROM rate_cards rc WHERE rc.po_id = po.id AND rc.is_active = TRUE) AS linked_employees
FROM purchase_orders po
JOIN clients c ON po.client_id = c.id
LEFT JOIN sows sw ON po.sow_id = sw.id;

GRANT SELECT ON rate_cards_view TO authenticated;
GRANT SELECT ON quotes_view TO authenticated;
GRANT SELECT ON sows_view TO authenticated;
GRANT SELECT ON purchase_orders_view TO authenticated;

CREATE OR REPLACE FUNCTION is_owner(owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL AND owner_id = auth.uid();
$$;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE permanent_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE permanent_client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE permanent_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE permanent_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sow_document_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sows ENABLE ROW LEVEL SECURITY;
ALTER TABLE sow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_consumption_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_po_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE clients FORCE ROW LEVEL SECURITY;
ALTER TABLE permanent_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE permanent_client_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE permanent_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE permanent_reminders FORCE ROW LEVEL SECURITY;
ALTER TABLE sow_document_index FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_cards FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_items FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_errors FORCE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_items FORCE ROW LEVEL SECURITY;
ALTER TABLE sows FORCE ROW LEVEL SECURITY;
ALTER TABLE sow_items FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE po_consumption_log FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_po_history FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_owner_select ON clients;
DROP POLICY IF EXISTS clients_owner_insert ON clients;
DROP POLICY IF EXISTS clients_owner_update ON clients;
DROP POLICY IF EXISTS clients_owner_delete ON clients;
CREATE POLICY clients_owner_select ON clients FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY clients_owner_insert ON clients FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY clients_owner_update ON clients FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY clients_owner_delete ON clients FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS permanent_clients_owner_select ON permanent_clients;
DROP POLICY IF EXISTS permanent_clients_owner_insert ON permanent_clients;
DROP POLICY IF EXISTS permanent_clients_owner_update ON permanent_clients;
DROP POLICY IF EXISTS permanent_clients_owner_delete ON permanent_clients;
CREATE POLICY permanent_clients_owner_select ON permanent_clients FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY permanent_clients_owner_insert ON permanent_clients FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_clients_owner_update ON permanent_clients FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_clients_owner_delete ON permanent_clients FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS permanent_client_contacts_owner_select ON permanent_client_contacts;
DROP POLICY IF EXISTS permanent_client_contacts_owner_insert ON permanent_client_contacts;
DROP POLICY IF EXISTS permanent_client_contacts_owner_update ON permanent_client_contacts;
DROP POLICY IF EXISTS permanent_client_contacts_owner_delete ON permanent_client_contacts;
CREATE POLICY permanent_client_contacts_owner_select ON permanent_client_contacts FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY permanent_client_contacts_owner_insert ON permanent_client_contacts FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_client_contacts_owner_update ON permanent_client_contacts FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_client_contacts_owner_delete ON permanent_client_contacts FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS permanent_orders_owner_select ON permanent_orders;
DROP POLICY IF EXISTS permanent_orders_owner_insert ON permanent_orders;
DROP POLICY IF EXISTS permanent_orders_owner_update ON permanent_orders;
DROP POLICY IF EXISTS permanent_orders_owner_delete ON permanent_orders;
CREATE POLICY permanent_orders_owner_select ON permanent_orders FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY permanent_orders_owner_insert ON permanent_orders FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_orders_owner_update ON permanent_orders FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_orders_owner_delete ON permanent_orders FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS permanent_reminders_owner_select ON permanent_reminders;
DROP POLICY IF EXISTS permanent_reminders_owner_insert ON permanent_reminders;
DROP POLICY IF EXISTS permanent_reminders_owner_update ON permanent_reminders;
DROP POLICY IF EXISTS permanent_reminders_owner_delete ON permanent_reminders;
CREATE POLICY permanent_reminders_owner_select ON permanent_reminders FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY permanent_reminders_owner_insert ON permanent_reminders FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_reminders_owner_update ON permanent_reminders FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY permanent_reminders_owner_delete ON permanent_reminders FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS sow_document_index_owner_select ON sow_document_index;
DROP POLICY IF EXISTS sow_document_index_owner_insert ON sow_document_index;
DROP POLICY IF EXISTS sow_document_index_owner_update ON sow_document_index;
DROP POLICY IF EXISTS sow_document_index_owner_delete ON sow_document_index;
CREATE POLICY sow_document_index_owner_select ON sow_document_index FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY sow_document_index_owner_insert ON sow_document_index FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY sow_document_index_owner_update ON sow_document_index FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY sow_document_index_owner_delete ON sow_document_index FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS rate_cards_owner_select ON rate_cards;
DROP POLICY IF EXISTS rate_cards_owner_insert ON rate_cards;
DROP POLICY IF EXISTS rate_cards_owner_update ON rate_cards;
DROP POLICY IF EXISTS rate_cards_owner_delete ON rate_cards;
CREATE POLICY rate_cards_owner_select ON rate_cards FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY rate_cards_owner_insert ON rate_cards FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY rate_cards_owner_update ON rate_cards FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY rate_cards_owner_delete ON rate_cards FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS attendance_owner_select ON attendance;
DROP POLICY IF EXISTS attendance_owner_insert ON attendance;
DROP POLICY IF EXISTS attendance_owner_update ON attendance;
DROP POLICY IF EXISTS attendance_owner_delete ON attendance;
CREATE POLICY attendance_owner_select ON attendance FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY attendance_owner_insert ON attendance FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY attendance_owner_update ON attendance FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY attendance_owner_delete ON attendance FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS billing_runs_owner_select ON billing_runs;
DROP POLICY IF EXISTS billing_runs_owner_insert ON billing_runs;
DROP POLICY IF EXISTS billing_runs_owner_update ON billing_runs;
DROP POLICY IF EXISTS billing_runs_owner_delete ON billing_runs;
CREATE POLICY billing_runs_owner_select ON billing_runs FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY billing_runs_owner_insert ON billing_runs FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY billing_runs_owner_update ON billing_runs FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY billing_runs_owner_delete ON billing_runs FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS billing_items_owner_select ON billing_items;
DROP POLICY IF EXISTS billing_items_owner_insert ON billing_items;
DROP POLICY IF EXISTS billing_items_owner_update ON billing_items;
DROP POLICY IF EXISTS billing_items_owner_delete ON billing_items;
CREATE POLICY billing_items_owner_select ON billing_items FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY billing_items_owner_insert ON billing_items FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY billing_items_owner_update ON billing_items FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY billing_items_owner_delete ON billing_items FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS billing_errors_owner_select ON billing_errors;
DROP POLICY IF EXISTS billing_errors_owner_insert ON billing_errors;
DROP POLICY IF EXISTS billing_errors_owner_update ON billing_errors;
DROP POLICY IF EXISTS billing_errors_owner_delete ON billing_errors;
CREATE POLICY billing_errors_owner_select ON billing_errors FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY billing_errors_owner_insert ON billing_errors FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY billing_errors_owner_update ON billing_errors FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY billing_errors_owner_delete ON billing_errors FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS quotes_owner_select ON quotes;
DROP POLICY IF EXISTS quotes_owner_insert ON quotes;
DROP POLICY IF EXISTS quotes_owner_update ON quotes;
DROP POLICY IF EXISTS quotes_owner_delete ON quotes;
CREATE POLICY quotes_owner_select ON quotes FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY quotes_owner_insert ON quotes FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY quotes_owner_update ON quotes FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY quotes_owner_delete ON quotes FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS quote_items_owner_select ON quote_items;
DROP POLICY IF EXISTS quote_items_owner_insert ON quote_items;
DROP POLICY IF EXISTS quote_items_owner_update ON quote_items;
DROP POLICY IF EXISTS quote_items_owner_delete ON quote_items;
CREATE POLICY quote_items_owner_select ON quote_items FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY quote_items_owner_insert ON quote_items FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY quote_items_owner_update ON quote_items FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY quote_items_owner_delete ON quote_items FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS sows_owner_select ON sows;
DROP POLICY IF EXISTS sows_owner_insert ON sows;
DROP POLICY IF EXISTS sows_owner_update ON sows;
DROP POLICY IF EXISTS sows_owner_delete ON sows;
CREATE POLICY sows_owner_select ON sows FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY sows_owner_insert ON sows FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY sows_owner_update ON sows FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY sows_owner_delete ON sows FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS sow_items_owner_select ON sow_items;
DROP POLICY IF EXISTS sow_items_owner_insert ON sow_items;
DROP POLICY IF EXISTS sow_items_owner_update ON sow_items;
DROP POLICY IF EXISTS sow_items_owner_delete ON sow_items;
CREATE POLICY sow_items_owner_select ON sow_items FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY sow_items_owner_insert ON sow_items FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY sow_items_owner_update ON sow_items FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY sow_items_owner_delete ON sow_items FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS purchase_orders_owner_select ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_owner_insert ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_owner_update ON purchase_orders;
DROP POLICY IF EXISTS purchase_orders_owner_delete ON purchase_orders;
CREATE POLICY purchase_orders_owner_select ON purchase_orders FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY purchase_orders_owner_insert ON purchase_orders FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY purchase_orders_owner_update ON purchase_orders FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY purchase_orders_owner_delete ON purchase_orders FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS po_consumption_log_owner_select ON po_consumption_log;
DROP POLICY IF EXISTS po_consumption_log_owner_insert ON po_consumption_log;
DROP POLICY IF EXISTS po_consumption_log_owner_update ON po_consumption_log;
DROP POLICY IF EXISTS po_consumption_log_owner_delete ON po_consumption_log;
CREATE POLICY po_consumption_log_owner_select ON po_consumption_log FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY po_consumption_log_owner_insert ON po_consumption_log FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY po_consumption_log_owner_update ON po_consumption_log FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY po_consumption_log_owner_delete ON po_consumption_log FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS employee_po_history_owner_select ON employee_po_history;
DROP POLICY IF EXISTS employee_po_history_owner_insert ON employee_po_history;
DROP POLICY IF EXISTS employee_po_history_owner_update ON employee_po_history;
DROP POLICY IF EXISTS employee_po_history_owner_delete ON employee_po_history;
CREATE POLICY employee_po_history_owner_select ON employee_po_history FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY employee_po_history_owner_insert ON employee_po_history FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY employee_po_history_owner_update ON employee_po_history FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY employee_po_history_owner_delete ON employee_po_history FOR DELETE TO authenticated USING (is_owner(owner_user_id));

DROP POLICY IF EXISTS audit_log_owner_select ON audit_log;
DROP POLICY IF EXISTS audit_log_owner_insert ON audit_log;
DROP POLICY IF EXISTS audit_log_owner_update ON audit_log;
DROP POLICY IF EXISTS audit_log_owner_delete ON audit_log;
CREATE POLICY audit_log_owner_select ON audit_log FOR SELECT TO authenticated USING (is_owner(owner_user_id));
CREATE POLICY audit_log_owner_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (is_owner(owner_user_id));
CREATE POLICY audit_log_owner_update ON audit_log FOR UPDATE TO authenticated USING (is_owner(owner_user_id)) WITH CHECK (is_owner(owner_user_id));
CREATE POLICY audit_log_owner_delete ON audit_log FOR DELETE TO authenticated USING (is_owner(owner_user_id));

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Get attendance summary grouped by employee for a billing month
CREATE OR REPLACE FUNCTION get_attendance_summary(p_billing_month TEXT)
RETURNS TABLE (
  emp_code TEXT,
  emp_name TEXT,
  reporting_manager TEXT,
  leaves_taken NUMERIC,
  days_present NUMERIC,
  total_days BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    a.emp_code,
    MAX(a.emp_name) AS emp_name,
    MAX(a.reporting_manager) AS reporting_manager,
    SUM(CASE WHEN a.status = 'L' THEN COALESCE(a.leave_units, 1) ELSE 0 END) AS leaves_taken,
    SUM(CASE
      WHEN a.status = 'P' THEN 1
      WHEN a.status = 'L' THEN (1 - COALESCE(a.leave_units, 1))
      ELSE 0
    END) AS days_present,
    COUNT(*) AS total_days
  FROM attendance a
  WHERE a.billing_month = p_billing_month
  GROUP BY a.emp_code
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

-- Renew PO (transaction: mark old as Renewed + insert new + inherit SOW)
CREATE OR REPLACE FUNCTION renew_po(
  p_old_id INTEGER,
  p_po_number TEXT,
  p_client_id INTEGER,
  p_po_date TEXT,
  p_start_date TEXT,
  p_end_date TEXT,
  p_po_value NUMERIC,
  p_alert_threshold NUMERIC DEFAULT 80,
  p_notes TEXT DEFAULT NULL,
  p_sow_id INTEGER DEFAULT NULL
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_id INTEGER;
  v_sow_id INTEGER;
BEGIN
  -- Inherit sow_id from old PO if not explicitly provided
  IF p_sow_id IS NULL THEN
    SELECT sow_id INTO v_sow_id FROM purchase_orders WHERE id = p_old_id;
  ELSE
    v_sow_id := p_sow_id;
  END IF;

  UPDATE purchase_orders SET status = 'Renewed', updated_at = NOW()
  WHERE id = p_old_id;

  INSERT INTO purchase_orders (po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, notes, sow_id)
  VALUES (p_po_number, p_client_id, p_po_date, p_start_date, p_end_date, p_po_value, p_alert_threshold, p_notes, v_sow_id)
  RETURNING id INTO v_new_id;

  -- Log assignment history before migrating
  INSERT INTO employee_po_history (rate_card_id, po_id, client_id, unassigned_date, notes)
  SELECT id, po_id, client_id, NOW(), 'PO renewed to ' || p_po_number
  FROM rate_cards
  WHERE po_id = p_old_id AND is_active = TRUE;

  -- Migrate employees from old PO to new PO
  UPDATE rate_cards SET po_id = v_new_id, updated_at = NOW()
  WHERE po_id = p_old_id AND is_active = TRUE;

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
  v_active_sows BIGINT;
  v_billing_runs BIGINT;
  v_pending_quotes BIGINT;
  v_recent_runs JSON;
  v_po_alerts JSON;
BEGIN
  SELECT COUNT(*) INTO v_clients FROM clients WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_employees FROM rate_cards WHERE is_active = TRUE;
  SELECT COUNT(*) INTO v_active_pos FROM purchase_orders WHERE status = 'Active';
  SELECT COUNT(*) INTO v_active_sows FROM sows WHERE status = 'Active';
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

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Ensure rate_card po_id references a PO belonging to the same client
CREATE OR REPLACE FUNCTION check_rate_card_po_client()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_po_client_id INTEGER;
BEGIN
    IF NEW.po_id IS NOT NULL THEN
        SELECT client_id INTO v_po_client_id FROM purchase_orders WHERE id = NEW.po_id;
        IF v_po_client_id IS NULL THEN
            RAISE EXCEPTION 'Purchase order % not found', NEW.po_id;
        END IF;
        IF v_po_client_id != NEW.client_id THEN
            RAISE EXCEPTION 'Purchase order belongs to a different client';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_card_po_client ON rate_cards;
CREATE TRIGGER trg_rate_card_po_client
BEFORE INSERT OR UPDATE ON rate_cards
FOR EACH ROW EXECUTE FUNCTION check_rate_card_po_client();

-- Ensure PO's sow_id references a SOW belonging to the same client
CREATE OR REPLACE FUNCTION check_po_sow_client()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_sow_client_id INTEGER;
BEGIN
    IF NEW.sow_id IS NOT NULL THEN
        SELECT client_id INTO v_sow_client_id FROM sows WHERE id = NEW.sow_id;
        IF v_sow_client_id IS NULL THEN
            RAISE EXCEPTION 'SOW % not found', NEW.sow_id;
        END IF;
        IF v_sow_client_id != NEW.client_id THEN
            RAISE EXCEPTION 'SOW belongs to a different client';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_sow_client ON purchase_orders;
CREATE TRIGGER trg_po_sow_client
BEFORE INSERT OR UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION check_po_sow_client();
