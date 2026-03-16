const db = require('../config/database');

const AttendanceModel = {
  findByMonth(empCode, billingMonth) {
    return db.all(
      'SELECT * FROM attendance WHERE emp_code = ? AND billing_month = ? ORDER BY day_number',
      [empCode, billingMonth]
    );
  },

  bulkUpsert(records) {
    const upsert = db.transaction((records) => {
      for (const rec of records) {
        db.run(
          `INSERT OR REPLACE INTO attendance (emp_code, emp_name, reporting_manager, billing_month, day_number, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [rec.emp_code, rec.emp_name || null, rec.reporting_manager || null,
           rec.billing_month, rec.day_number, rec.status]
        );
      }
    });
    upsert(records);
  },

  getLeaveCount(empCode, billingMonth) {
    const result = db.get(
      "SELECT COUNT(*) as count FROM attendance WHERE emp_code = ? AND billing_month = ? AND status = 'L'",
      [empCode, billingMonth]
    );
    return result ? result.count : 0;
  },

  getSummary(billingMonth) {
    return db.all(
      `SELECT emp_code, emp_name, reporting_manager,
       SUM(CASE WHEN status = 'L' THEN 1 ELSE 0 END) as leaves_taken,
       SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) as days_present,
       COUNT(*) as total_days
       FROM attendance WHERE billing_month = ?
       GROUP BY emp_code
       ORDER BY emp_code`,
      [billingMonth]
    );
  },

  deleteByEmpMonth(empCode, billingMonth) {
    db.run('DELETE FROM attendance WHERE emp_code = ? AND billing_month = ?', [empCode, billingMonth]);
  },

  getEmployeeList(billingMonth) {
    return db.all(
      'SELECT DISTINCT emp_code, emp_name FROM attendance WHERE billing_month = ? ORDER BY emp_code',
      [billingMonth]
    );
  },
};

module.exports = AttendanceModel;
