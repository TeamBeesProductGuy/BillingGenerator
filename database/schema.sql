-- Billing Generator - SQLite Schema

CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name     TEXT NOT NULL,
    abbreviation    TEXT,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    leaves_allowed  INTEGER NOT NULL DEFAULT 0 CHECK(leaves_allowed >= 0),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_name_location_active
ON clients (LOWER(client_name), LOWER(COALESCE(address, '')))
WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS permanent_clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name     TEXT NOT NULL,
    abbreviation    TEXT,
    address         TEXT,
    billing_address TEXT,
    billing_pattern TEXT NOT NULL CHECK(billing_pattern IN ('Immediate', '7 days', '30 days', '60 days', '90 days')),
    billing_rate    REAL NOT NULL CHECK(billing_rate > 0 AND billing_rate <= 100),
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permanent_clients_unique_name_location_active
ON permanent_clients (LOWER(client_name), LOWER(COALESCE(address, '')))
WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS permanent_client_contacts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       INTEGER NOT NULL REFERENCES permanent_clients(id) ON DELETE CASCADE,
    contact_name    TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    designation     TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_permanent_contacts_client ON permanent_client_contacts(client_id);

CREATE TABLE IF NOT EXISTS permanent_orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       INTEGER NOT NULL REFERENCES permanent_clients(id),
    candidate_name  TEXT NOT NULL,
    requisition_description TEXT,
    position_role   TEXT NOT NULL,
    date_of_offer   TEXT,
    date_of_joining TEXT NOT NULL,
    ctc_offered     REAL NOT NULL CHECK(ctc_offered > 0),
    bill_amount     REAL NOT NULL CHECK(bill_amount >= 0),
    next_bill_date  TEXT NOT NULL,
    remarks         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_permanent_orders_client ON permanent_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_permanent_orders_next_bill_date ON permanent_orders(next_bill_date);

CREATE TABLE IF NOT EXISTS permanent_reminders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES permanent_orders(id) ON DELETE CASCADE,
    due_date         TEXT NOT NULL,
    email_primary    TEXT,
    email_secondary  TEXT,
    payment_status   TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
    invoice_status   TEXT NOT NULL DEFAULT 'pending' CHECK (invoice_status IN ('pending', 'sent')),
    invoice_number   TEXT,
    invoice_date     TEXT,
    invoice_sent_at  TEXT,
    status           TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Closed')),
    closed_at        TEXT,
    reminder_sent_at TEXT,
    next_reminder_at TEXT,
    reminder_count   INTEGER NOT NULL DEFAULT 0,
    mail_last_status TEXT,
    mail_last_error  TEXT,
    extended_count   INTEGER NOT NULL DEFAULT 0,
    last_extended_at TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permanent_reminders_order_open
ON permanent_reminders(order_id)
WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS idx_permanent_reminders_due_date ON permanent_reminders(due_date);

CREATE TABLE IF NOT EXISTS activity_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email    TEXT,
    module        TEXT NOT NULL,
    action        TEXT NOT NULL,
    entity_type   TEXT,
    entity_id     TEXT,
    entity_label  TEXT,
    details       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module_action ON activity_logs(module, action);

CREATE TABLE IF NOT EXISTS sow_document_index (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_name         TEXT NOT NULL UNIQUE,
    quote_id            INTEGER REFERENCES quotes(id),
    client_id           INTEGER REFERENCES clients(id),
    client_abbreviation TEXT,
    candidate_name      TEXT,
    sow_numbers         TEXT NOT NULL DEFAULT '[]',
    roles               TEXT NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sow_document_index_quote ON sow_document_index(quote_id);
CREATE INDEX IF NOT EXISTS idx_sow_document_index_client ON sow_document_index(client_id);

CREATE TABLE IF NOT EXISTS rate_cards (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id         INTEGER NOT NULL REFERENCES clients(id),
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    doj               TEXT,
    reporting_manager TEXT,
    service_description TEXT,
    sow_item_id       INTEGER,
    monthly_rate      REAL NOT NULL CHECK(monthly_rate >= 0),
    leaves_allowed    INTEGER NOT NULL DEFAULT 0 CHECK(leaves_allowed >= 0),
    charging_date     TEXT,
    sow_id            INTEGER REFERENCES sows(id),
    po_id             INTEGER REFERENCES purchase_orders(id),
    billing_active    INTEGER NOT NULL DEFAULT 1,
    no_invoice        INTEGER NOT NULL DEFAULT 0,
    pause_billing     INTEGER NOT NULL DEFAULT 0,
    pause_start_date  TEXT,
    pause_end_date    TEXT,
    disable_billing   INTEGER NOT NULL DEFAULT 0,
    disable_from_date TEXT,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(client_id, emp_code)
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_client ON rate_cards(client_id);
CREATE INDEX IF NOT EXISTS idx_rate_cards_emp_code ON rate_cards(emp_code);

CREATE TABLE IF NOT EXISTS attendance (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_code          TEXT NOT NULL,
    emp_name          TEXT,
    reporting_manager TEXT,
    billing_month     TEXT NOT NULL,
    day_number        INTEGER NOT NULL CHECK(day_number >= 1 AND day_number <= 31),
    status            TEXT NOT NULL CHECK(status IN ('P', 'L', 'WO')),
    leave_units       REAL NOT NULL DEFAULT 0 CHECK(
                      (status = 'P' AND leave_units = 0)
                      OR (status = 'WO' AND leave_units = 0)
                      OR (status = 'L' AND leave_units IN (0.5, 1))
                    ),
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(emp_code, billing_month, day_number)
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_month ON attendance(emp_code, billing_month);

CREATE TABLE IF NOT EXISTS billing_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_month   TEXT NOT NULL,
    client_id       INTEGER REFERENCES clients(id),
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_amount    REAL NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    output_file     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS billing_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_run_id    INTEGER NOT NULL REFERENCES billing_runs(id) ON DELETE CASCADE,
    client_name       TEXT NOT NULL,
    service_description TEXT,
    po_number         TEXT,
    po_date           TEXT,
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    reporting_manager TEXT,
    monthly_rate      REAL NOT NULL,
    leaves_allowed    INTEGER NOT NULL DEFAULT 0,
    leaves_taken      REAL NOT NULL DEFAULT 0,
    days_present      REAL,
    billing_hours     REAL,
    billing_method    TEXT,
    days_in_month     INTEGER NOT NULL,
    chargeable_days   REAL NOT NULL,
    billing_status    TEXT,
    billing_note      TEXT,
    approval_status   TEXT NOT NULL DEFAULT 'Pending' CHECK (approval_status IN ('Pending', 'Accepted', 'Rejected')),
    approved_at       TEXT,
    approved_by_manager TEXT,
    po_consumed_at    TEXT,
    invoice_amount    REAL NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_billing_items_run ON billing_items(billing_run_id);

CREATE TABLE IF NOT EXISTS billing_errors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    billing_run_id  INTEGER NOT NULL REFERENCES billing_runs(id) ON DELETE CASCADE,
    emp_code        TEXT,
    error_message   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_billing_errors_run ON billing_errors(billing_run_id);

CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_number    TEXT NOT NULL UNIQUE,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    quote_date      TEXT NOT NULL,
    valid_until     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired')),
    subtotal        REAL NOT NULL DEFAULT 0,
    tax_percent     REAL NOT NULL DEFAULT 18,
    tax_amount      REAL NOT NULL DEFAULT 0,
    total_amount    REAL NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_rate       REAL NOT NULL,
    amount          REAL NOT NULL,
    emp_code        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number       TEXT NOT NULL UNIQUE,
    client_id       INTEGER NOT NULL REFERENCES clients(id),
    quote_id        INTEGER REFERENCES quotes(id),
    po_date         TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    po_value        REAL NOT NULL CHECK(po_value > 0),
    consumed_value  REAL NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive', 'Expired', 'Exhausted', 'Renewed', 'Cancelled')),
    alert_threshold REAL NOT NULL DEFAULT 80,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_po_client ON purchase_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS po_consumption_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id           INTEGER NOT NULL REFERENCES purchase_orders(id),
    billing_run_id  INTEGER REFERENCES billing_runs(id),
    amount          REAL NOT NULL,
    description     TEXT,
    consumed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_po_consumption_po ON po_consumption_log(po_id);
