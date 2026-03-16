const db = require('../config/database');

const ClientModel = {
  findAll() {
    return db.all('SELECT * FROM clients WHERE is_active = 1 ORDER BY client_name');
  },

  findById(id) {
    return db.get('SELECT * FROM clients WHERE id = ?', [id]);
  },

  create(data) {
    const result = db.run(
      `INSERT INTO clients (client_name, contact_person, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`,
      [data.client_name, data.contact_person || null, data.email || null, data.phone || null, data.address || null]
    );
    return result.lastInsertRowid;
  },

  update(id, data) {
    db.run(
      `UPDATE clients SET client_name = ?, contact_person = ?, email = ?, phone = ?, address = ?,
       updated_at = datetime('now') WHERE id = ?`,
      [data.client_name, data.contact_person || null, data.email || null, data.phone || null, data.address || null, id]
    );
  },

  softDelete(id) {
    db.run("UPDATE clients SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  },
};

module.exports = ClientModel;
