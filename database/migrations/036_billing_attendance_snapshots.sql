CREATE TABLE IF NOT EXISTS public.billing_attendance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  billing_run_id INTEGER NOT NULL REFERENCES public.billing_runs(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  emp_code TEXT NOT NULL,
  emp_name TEXT,
  reporting_manager TEXT,
  day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 31),
  status TEXT NOT NULL CHECK (status IN ('P', 'L', 'WO')),
  leave_units NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (
    (status = 'P' AND leave_units = 0)
    OR (status = 'WO' AND leave_units = 0)
    OR (status = 'L' AND leave_units IN (0.5, 1))
  ),
  attendance_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (billing_run_id, emp_code, day_number)
);

CREATE INDEX IF NOT EXISTS idx_billing_attendance_snapshots_run
  ON public.billing_attendance_snapshots(billing_run_id);

CREATE INDEX IF NOT EXISTS idx_billing_attendance_snapshots_emp_month
  ON public.billing_attendance_snapshots(emp_code, billing_month);

COMMENT ON TABLE public.billing_attendance_snapshots IS
  'Per billing run attendance export snapshot. Service request calculations do not read this table.';
