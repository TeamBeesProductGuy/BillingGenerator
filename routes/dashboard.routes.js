const router = require('express').Router();
const db = require('../config/database');

router.get('/stats', (req, res, next) => {
  try {
    const clients = db.get('SELECT COUNT(*) as count FROM clients WHERE is_active = 1');
    const employees = db.get('SELECT COUNT(*) as count FROM rate_cards WHERE is_active = 1');
    const activePOs = db.get("SELECT COUNT(*) as count FROM purchase_orders WHERE status = 'Active'");
    const billingRuns = db.get('SELECT COUNT(*) as count FROM billing_runs');
    const pendingQuotes = db.get("SELECT COUNT(*) as count FROM quotes WHERE status = 'Draft'");

    const recentRuns = db.all(
      `SELECT id, billing_month, total_employees, total_amount, error_count, created_at
       FROM billing_runs ORDER BY created_at DESC LIMIT 5`
    );

    const poAlerts = db.all(
      `SELECT po.id, po.po_number, c.client_name, po.po_value, po.consumed_value, po.end_date, po.alert_threshold,
        CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END as consumption_pct
       FROM purchase_orders po JOIN clients c ON po.client_id = c.id
       WHERE po.status = 'Active'
         AND (
           (CASE WHEN po.po_value > 0 THEN (po.consumed_value / po.po_value) * 100 ELSE 0 END) >= po.alert_threshold
           OR date(po.end_date) <= date('now', '+30 days')
         )`
    );

    res.json({
      success: true,
      data: {
        counts: {
          clients: clients ? clients.count : 0,
          employees: employees ? employees.count : 0,
          activePOs: activePOs ? activePOs.count : 0,
          billingRuns: billingRuns ? billingRuns.count : 0,
          pendingQuotes: pendingQuotes ? pendingQuotes.count : 0,
        },
        recentRuns,
        poAlerts,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
