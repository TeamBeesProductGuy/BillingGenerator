-- Billing Generator - Initial Schema

CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name     TEXT NOT NULL,
    abbreviation    TEXT,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_name_location_active
ON clients (LOWER(client_name), LOWER(COALESCE(address, '')))
WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS rate_cards (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id         INTEGER NOT NULL REFERENCES clients(id),
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    doj               TEXT,
    reporting_manager TEXT,
    monthly_rate      REAL NOT NULL CHECK(monthly_rate > 0),
    leaves_allowed    INTEGER NOT NULL DEFAULT 0 CHECK(leaves_allowed >= 0),
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
    status            TEXT NOT NULL CHECK(status IN ('P', 'L')),
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
    emp_code          TEXT NOT NULL,
    emp_name          TEXT NOT NULL,
    reporting_manager TEXT,
    monthly_rate      REAL NOT NULL,
    leaves_allowed    INTEGER NOT NULL DEFAULT 0,
    leaves_taken      INTEGER NOT NULL DEFAULT 0,
    days_in_month     INTEGER NOT NULL,
    chargeable_days   REAL NOT NULL,
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
    status          TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Expired', 'Exhausted', 'Renewed', 'Cancelled')),
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
