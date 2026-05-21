ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS attendance_code TEXT;

UPDATE public.attendance
SET attendance_code = CASE
  WHEN status = 'P' THEN 'PR'
  WHEN status = 'WO' THEN 'WO'
  WHEN status = 'L' AND COALESCE(leave_units, 1) = 0.5 THEN 'HDL'
  WHEN status = 'L' THEN 'CL'
  ELSE status
END
WHERE attendance_code IS NULL OR attendance_code = '';

COMMENT ON COLUMN public.attendance.attendance_code IS
  'Original attendance code imported from Excel, for exports only. Billing calculations continue to use status and leave_units.';
