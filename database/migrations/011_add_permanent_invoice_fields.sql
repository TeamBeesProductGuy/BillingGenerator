ALTER TABLE permanent_orders
  ADD COLUMN IF NOT EXISTS requisition_description TEXT,
  ADD COLUMN IF NOT EXISTS date_of_offer TEXT;

ALTER TABLE permanent_reminders
  ADD COLUMN IF NOT EXISTS invoice_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invoice_status IN ('pending', 'sent')),
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date TEXT,
  ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMPTZ;
