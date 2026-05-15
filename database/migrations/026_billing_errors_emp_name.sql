-- Store employee names on service request errors so the UI can show
-- Emp Code | Emp Name | Error Msg without parsing the message text.

ALTER TABLE billing_errors ADD COLUMN IF NOT EXISTS emp_name TEXT;
