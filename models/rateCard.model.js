const db = require('../config/database');

const RateCardModel = {
  findAll(clientId) {
    if (clientId) {
      return db.all(
        `SELECT rc.*, c.client_name FROM rate_cards rc
         JOIN clients c ON rc.client_id = c.id
         WHERE rc.is_active = 1 AND rc.client_id = ?
         ORDER BY rc.emp_code`,
        [clientId]
      );
    }
    return db.all(
      `SELECT rc.*, c.client_name FROM rate_cards rc
       JOIN clients c ON rc.client_id = c.id
       WHERE rc.is_active = 1
       ORDER BY c.client_name, rc.emp_code`
    );
  },

  findById(id) {
    return db.get(
      `SELECT rc.*, c.client_name FROM rate_cards rc
       JOIN clients c ON rc.client_id = c.id
       WHERE rc.id = ?`,
      [id]
    );
  },

  findByEmpCode(empCode, clientId) {
    return db.get(
      'SELECT * FROM rate_cards WHERE emp_code = ? AND client_id = ? AND is_active = 1',
      [empCode, clientId]
    );
  },

  create(data) {
    const result = db.run(
      `INSERT INTO rate_cards (client_id, emp_code, emp_name, doj, reporting_manager, monthly_rate, leaves_allowed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.client_id, data.emp_code, data.emp_name, data.doj || null,
       data.reporting_manager || null, data.monthly_rate, data.leaves_allowed || 0]
    );
    return result.lastInsertRowid;
  },

  bulkCreate(records) {
    const insert = db.transaction((records) => {
      const ids = [];
      for (const data of records) {
        const result = db.run(
          `INSERT OR REPLACE INTO rate_cards (client_id, emp_code, emp_name, doj, reporting_manager, monthly_rate, leaves_allowed, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          [data.client_id, data.emp_code, data.emp_name, data.doj || null,
           data.reporting_manager || null, data.monthly_rate, data.leaves_allowed || 0]
        );
        ids.push(result.lastInsertRowid);
      }
      return ids;
    });
    return insert(records);
  },

  update(id, data) {
    db.run(
      `UPDATE rate_cards SET emp_name = ?, doj = ?, reporting_manager = ?,
       monthly_rate = ?, leaves_allowed = ?, updated_at = datetime('now') WHERE id = ?`,
      [data.emp_name, data.doj || null, data.reporting_manager || null,
       data.monthly_rate, data.leaves_allowed || 0, id]
    );
  },

  softDelete(id) {
    db.run("UPDATE rate_cards SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  },
};

module.exports = RateCardModel;
