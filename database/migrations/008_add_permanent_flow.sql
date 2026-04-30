-- Phase 2: Permanent client flow (clients, orders, reminders)

CREATE TABLE IF NOT EXISTS permanent_clients (
    id              SERIAL PRIMARY KEY,
    client_name     TEXT NOT NULL,
    abbreviation    TEXT,
    address         TEXT,
    billing_address TEXT,
    billing_pattern TEXT NOT NULL CHECK(billing_pattern IN ('Immediate', '7 days', '30 days', '60 days', '90 days')),
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
    position_role   TEXT NOT NULL,
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
    status           TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Closed')),
    closed_at        TIMESTAMPTZ,
    extended_count   INTEGER NOT NULL DEFAULT 0,
    last_extended_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permanent_reminders_order_open
ON permanent_reminders(order_id)
WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS idx_permanent_reminders_due_date ON permanent_reminders(due_date);
