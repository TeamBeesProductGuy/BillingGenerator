const db = require('../config/database');

const POModel = {
  findAll(clientId, status) {
    let sql = `SELECT po.*, c.client_name,
      CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END as consumption_pct,
      ROUND(po.po_value - po.consumed_value, 2) as remaining_value
      FROM purchase_orders po JOIN clients c ON po.client_id = c.id WHERE 1=1`;
    const params = [];
    if (clientId) { sql += ' AND po.client_id = ?'; params.push(clientId); }
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    sql += ' ORDER BY po.created_at DESC';
    return db.all(sql, params);
  },

  findById(id) {
    const po = db.get(
      `SELECT po.*, c.client_name,
       CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END as consumption_pct,
       ROUND(po.po_value - po.consumed_value, 2) as remaining_value
       FROM purchase_orders po JOIN clients c ON po.client_id = c.id WHERE po.id = ?`,
      [id]
    );
    if (!po) return null;
    const consumptionLog = db.all(
      'SELECT * FROM po_consumption_log WHERE po_id = ? ORDER BY consumed_at DESC',
      [id]
    );
    return { ...po, consumptionLog };
  },

  create(data) {
    const result = db.run(
      `INSERT INTO purchase_orders (po_number, client_id, quote_id, po_date, start_date, end_date, po_value, alert_threshold, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.po_number, data.client_id, data.quote_id || null, data.po_date,
       data.start_date, data.end_date, data.po_value, data.alert_threshold || 80, data.notes || null]
    );
    return result.lastInsertRowid;
  },

  update(id, data) {
    db.run(
      `UPDATE purchase_orders SET po_number = ?, client_id = ?, po_date = ?, start_date = ?, end_date = ?,
       po_value = ?, alert_threshold = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [data.po_number, data.client_id, data.po_date, data.start_date, data.end_date,
       data.po_value, data.alert_threshold || 80, data.notes || null, id]
    );
  },

  addConsumption(poId, amount, description, billingRunId) {
    const consumeFn = db.transaction(() => {
      db.run(
        `INSERT INTO po_consumption_log (po_id, billing_run_id, amount, description)
         VALUES (?, ?, ?, ?)`,
        [poId, billingRunId || null, amount, description || null]
      );
      db.run(
        `UPDATE purchase_orders SET consumed_value = consumed_value + ?, updated_at = datetime('now') WHERE id = ?`,
        [amount, poId]
      );

      // Check if PO is now exhausted
      const po = db.get('SELECT po_value, consumed_value FROM purchase_orders WHERE id = ?', [poId]);
      if (po && po.consumed_value >= po.po_value) {
        db.run("UPDATE purchase_orders SET status = 'Exhausted', updated_at = datetime('now') WHERE id = ?", [poId]);
      }
    });
    consumeFn();
  },

  getAlerts() {
    return db.all(
      `SELECT po.*, c.client_name,
       CASE WHEN po.po_value > 0 THEN ROUND((po.consumed_value / po.po_value) * 100, 2) ELSE 0 END as consumption_pct,
       ROUND(po.po_value - po.consumed_value, 2) as remaining_value
       FROM purchase_orders po JOIN clients c ON po.client_id = c.id
       WHERE po.status = 'Active'
       AND (
         (CASE WHEN po.po_value > 0 THEN (po.consumed_value / po.po_value) * 100 ELSE 0 END) >= po.alert_threshold
         OR date(po.end_date) <= date('now', '+30 days')
       )
       ORDER BY po.end_date`
    );
  },

  renew(id, newPoData) {
    const renewFn = db.transaction(() => {
      db.run("UPDATE purchase_orders SET status = 'Renewed', updated_at = datetime('now') WHERE id = ?", [id]);
      const result = db.run(
        `INSERT INTO purchase_orders (po_number, client_id, po_date, start_date, end_date, po_value, alert_threshold, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newPoData.po_number, newPoData.client_id, newPoData.po_date,
         newPoData.start_date, newPoData.end_date, newPoData.po_value,
         newPoData.alert_threshold || 80, newPoData.notes || null]
      );
      return result.lastInsertRowid;
    });
    return renewFn();
  },
};

module.exports = POModel;
