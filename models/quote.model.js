const db = require('../config/database');

const QuoteModel = {
  findAll(clientId, status) {
    let sql = `SELECT q.*, c.client_name FROM quotes q JOIN clients c ON q.client_id = c.id WHERE 1=1`;
    const params = [];
    if (clientId) { sql += ' AND q.client_id = ?'; params.push(clientId); }
    if (status) { sql += ' AND q.status = ?'; params.push(status); }
    sql += ' ORDER BY q.created_at DESC';
    return db.all(sql, params);
  },

  findById(id) {
    const quote = db.get(
      'SELECT q.*, c.client_name FROM quotes q JOIN clients c ON q.client_id = c.id WHERE q.id = ?',
      [id]
    );
    if (!quote) return null;
    const items = db.all('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id', [id]);
    return { ...quote, items };
  },

  generateQuoteNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = db.get(
      "SELECT COUNT(*) as cnt FROM quotes WHERE quote_number LIKE ?",
      [`Q-${today}-%`]
    );
    const seq = String((count ? count.cnt : 0) + 1).padStart(3, '0');
    return `Q-${today}-${seq}`;
  },

  create(quote, items) {
    const createFn = db.transaction(() => {
      const quoteNumber = QuoteModel.generateQuoteNumber();
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = Math.round(subtotal * (quote.tax_percent || 18) / 100 * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      const result = db.run(
        `INSERT INTO quotes (quote_number, client_id, quote_date, valid_until, status, subtotal, tax_percent, tax_amount, total_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteNumber, quote.client_id, quote.quote_date, quote.valid_until, 'Draft',
         subtotal, quote.tax_percent || 18, taxAmount, totalAmount, quote.notes || null]
      );

      const quoteId = result.lastInsertRowid;
      for (const item of items) {
        db.run(
          `INSERT INTO quote_items (quote_id, description, quantity, unit_rate, amount, emp_code)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [quoteId, item.description, item.quantity, item.unit_rate, item.amount, item.emp_code || null]
        );
      }

      return { id: quoteId, quote_number: quoteNumber };
    });
    return createFn();
  },

  update(id, quote, items) {
    const updateFn = db.transaction(() => {
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = Math.round(subtotal * (quote.tax_percent || 18) / 100 * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      db.run(
        `UPDATE quotes SET client_id = ?, quote_date = ?, valid_until = ?, subtotal = ?,
         tax_percent = ?, tax_amount = ?, total_amount = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [quote.client_id, quote.quote_date, quote.valid_until, subtotal,
         quote.tax_percent || 18, taxAmount, totalAmount, quote.notes || null, id]
      );

      db.run('DELETE FROM quote_items WHERE quote_id = ?', [id]);
      for (const item of items) {
        db.run(
          `INSERT INTO quote_items (quote_id, description, quantity, unit_rate, amount, emp_code)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, item.description, item.quantity, item.unit_rate, item.amount, item.emp_code || null]
        );
      }
    });
    updateFn();
  },

  updateStatus(id, status) {
    db.run("UPDATE quotes SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
  },

  delete(id) {
    db.run('DELETE FROM quotes WHERE id = ?', [id]);
  },
};

module.exports = QuoteModel;
