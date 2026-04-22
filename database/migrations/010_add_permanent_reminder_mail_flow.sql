ALTER TABLE permanent_reminders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mail_last_status TEXT,
  ADD COLUMN IF NOT EXISTS mail_last_error TEXT;

UPDATE permanent_reminders
SET next_reminder_at = COALESCE(
  next_reminder_at,
  ((due_date::date - INTERVAL '3 days')::timestamp AT TIME ZONE 'UTC')
)
WHERE next_reminder_at IS NULL;
