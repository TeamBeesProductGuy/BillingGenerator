const db = require('../config/database');

const BillingModel = {
  createRun(data) {
    const result = db.run(
      `INSERT INTO billing_runs (billing_month, client_id, total_employees, total_amount, gst_percent, gst_amount, total_with_gst, error_count, output_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.billing_month, data.client_id || null, data.total_employees, data.total_amount,
       data.gst_percent || 0, data.gst_amount || 0, data.total_with_gst || 0,
       data.error_count, data.output_file]
    );
    return result.lastInsertRowid;
  },

  addItems(runId, items) {
    const insert = db.transaction((items) => {
      for (const item of items) {
        db.run(
          `INSERT INTO billing_items (billing_run_id, client_name, emp_code, emp_name, reporting_manager,
           monthly_rate, leaves_allowed, leaves_taken, days_in_month, chargeable_days, invoice_amount,
           gst_percent, gst_amount, total_with_gst)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [runId, item.client_name, item.emp_code, item.emp_name, item.reporting_manager,
           item.monthly_rate, item.allowed_leaves, item.leaves_taken, item.days_in_month,
           item.chargeable_days, item.invoice_amount,
           item.gst_percent || 0, item.gst_amount || 0, item.total_with_gst || 0]
        );
      }
    });
    insert(items);
  },

  addErrors(runId, errors) {
    const insert = db.transaction((errors) => {
      for (const err of errors) {
        db.run(
          `INSERT INTO billing_errors (billing_run_id, emp_code, error_message)
           VALUES (?, ?, ?)`,
          [runId, err.emp_code || null, err.error_message]
        );
      }
    });
    insert(errors);
  },

  findRuns(limit = 20, offset = 0) {
    return db.all(
      `SELECT id, billing_month, total_employees, total_amount, gst_amount, total_with_gst, error_count, output_file, created_at
       FROM billing_runs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  },

  findRunById(id) {
    const run = db.get('SELECT * FROM billing_runs WHERE id = ?', [id]);
    if (!run) return null;
    const items = db.all('SELECT * FROM billing_items WHERE billing_run_id = ?', [id]);
    const errors = db.all('SELECT * FROM billing_errors WHERE billing_run_id = ?', [id]);
    return { ...run, items, errors };
  },
};

module.exports = BillingModel;
