ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS leave_units NUMERIC(4,2);

UPDATE attendance
SET leave_units = CASE WHEN status = 'L' THEN 1 ELSE 0 END
WHERE leave_units IS NULL;

ALTER TABLE attendance
  ALTER COLUMN leave_units SET DEFAULT 0,
  ALTER COLUMN leave_units SET NOT NULL;

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_leave_units_check;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_leave_units_check
  CHECK (
    (status = 'P' AND leave_units = 0)
    OR (status = 'L' AND leave_units IN (0.5, 1))
  );

ALTER TABLE billing_items
  ALTER COLUMN leaves_taken TYPE NUMERIC(10,2) USING leaves_taken::NUMERIC(10,2);

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
  GROUP BY a.emp_code;
$$;
