-- Manager-level service request approvals.
-- Each billing item can be approved independently, so PO consumption can happen
-- as reporting manager approvals arrive.

ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'Pending';
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS approved_by_manager TEXT;
ALTER TABLE billing_items ADD COLUMN IF NOT EXISTS po_consumed_at TIMESTAMPTZ;

UPDATE billing_items
SET approval_status = 'Pending'
WHERE approval_status IS NULL OR approval_status = '';

ALTER TABLE billing_items DROP CONSTRAINT IF EXISTS billing_items_approval_status_check;
ALTER TABLE billing_items
  ADD CONSTRAINT billing_items_approval_status_check
  CHECK (approval_status IN ('Pending', 'Accepted', 'Rejected'));

ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS request_status TEXT NOT NULL DEFAULT 'Pending';
ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ;
ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS consumption_applied_at TIMESTAMPTZ;

ALTER TABLE billing_runs DROP CONSTRAINT IF EXISTS billing_runs_request_status_check;
ALTER TABLE billing_runs
  ADD CONSTRAINT billing_runs_request_status_check
  CHECK (request_status IN ('Pending', 'Partially Accepted', 'Accepted', 'Rejected'));

CREATE INDEX IF NOT EXISTS idx_billing_items_approval_status ON billing_items(approval_status);
CREATE INDEX IF NOT EXISTS idx_billing_items_manager ON billing_items(reporting_manager);
CREATE INDEX IF NOT EXISTS idx_billing_items_po_consumed ON billing_items(po_consumed_at);
