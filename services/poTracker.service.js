const db = require('../config/database');

const POTracker = {
  checkAlerts() {
    const valueAlerts = db.all(
      `SELECT po.*, c.client_name,
       CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END as consumption_pct
       FROM purchase_orders po JOIN clients c ON po.client_id = c.id
       WHERE po.status = 'Active'
       AND po.po_value > 0
       AND (po.consumed_value / po.po_value) * 100 >= po.alert_threshold`
    );

    const expiryAlerts = db.all(
      `SELECT po.*, c.client_name
       FROM purchase_orders po JOIN clients c ON po.client_id = c.id
       WHERE po.status = 'Active'
       AND date(po.end_date) <= date('now', '+30 days')`
    );

    return { valueAlerts, expiryAlerts };
  },

  checkAndUpdateExpired() {
    db.run(
      `UPDATE purchase_orders SET status = 'Expired', updated_at = datetime('now')
       WHERE status = 'Active' AND date(end_date) < date('now')`
    );
  },
};

module.exports = POTracker;
