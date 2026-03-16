/**
 * Seed script - populates the database with sample data for development.
 * Usage: npm run db:seed
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../config/database');

function seed() {
  db.init();

  console.log('Seeding database...');

  // Clear existing data (order matters due to foreign keys)
  db.exec('DELETE FROM billing_errors');
  db.exec('DELETE FROM billing_items');
  db.exec('DELETE FROM billing_runs');
  db.exec('DELETE FROM po_consumption_log');
  db.exec('DELETE FROM purchase_orders');
  db.exec('DELETE FROM quote_items');
  db.exec('DELETE FROM quotes');
  db.exec('DELETE FROM attendance');
  db.exec('DELETE FROM rate_cards');
  db.exec('DELETE FROM clients');

  // Clients
  const clients = [
    { name: 'Acme Corporation', contact: 'John Smith', email: 'john@acme.com', phone: '9876543210', address: 'Mumbai, Maharashtra' },
    { name: 'TechNova Solutions', contact: 'Priya Patel', email: 'priya@technova.in', phone: '9876543211', address: 'Bangalore, Karnataka' },
    { name: 'GlobalEdge Consulting', contact: 'Rahul Mehta', email: 'rahul@globaledge.com', phone: '9876543212', address: 'Delhi, NCR' },
  ];

  const clientIds = [];
  for (const c of clients) {
    const { lastInsertRowid } = db.run(
      'INSERT INTO clients (client_name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [c.name, c.contact, c.email, c.phone, c.address]
    );
    clientIds.push(lastInsertRowid);
    console.log(`  Client: ${c.name} (id=${lastInsertRowid})`);
  }

  // Rate Cards
  const rateCards = [
    { client_idx: 0, emp_code: 'EMP001', emp_name: 'Arun Kumar', doj: '2024-01-15', manager: 'Vikram Singh', rate: 50000, leaves: 2 },
    { client_idx: 0, emp_code: 'EMP002', emp_name: 'Sneha Reddy', doj: '2024-03-01', manager: 'Vikram Singh', rate: 65000, leaves: 2 },
    { client_idx: 0, emp_code: 'EMP003', emp_name: 'Deepak Joshi', doj: '2024-06-10', manager: 'Vikram Singh', rate: 45000, leaves: 1 },
    { client_idx: 1, emp_code: 'TN001', emp_name: 'Kavitha M', doj: '2024-02-20', manager: 'Suresh R', rate: 75000, leaves: 2 },
    { client_idx: 1, emp_code: 'TN002', emp_name: 'Rajesh N', doj: '2024-04-15', manager: 'Suresh R', rate: 55000, leaves: 1 },
    { client_idx: 2, emp_code: 'GE001', emp_name: 'Anita Sharma', doj: '2024-05-01', manager: 'Pooja Gupta', rate: 80000, leaves: 2 },
    { client_idx: 2, emp_code: 'GE002', emp_name: 'Mohit Verma', doj: '2024-07-10', manager: 'Pooja Gupta', rate: 60000, leaves: 2 },
  ];

  for (const rc of rateCards) {
    db.run(
      'INSERT INTO rate_cards (client_id, emp_code, emp_name, doj, reporting_manager, monthly_rate, leaves_allowed) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clientIds[rc.client_idx], rc.emp_code, rc.emp_name, rc.doj, rc.manager, rc.rate, rc.leaves]
    );
  }
  console.log(`  Rate cards: ${rateCards.length} inserted`);

  // Attendance for last month (Feb 2026)
  const billingMonth = '202602';
  const daysInMonth = 28;

  const insertAttendance = db.transaction((records) => {
    for (const rec of records) {
      for (let day = 1; day <= daysInMonth; day++) {
        const status = rec.leaveDays.includes(day) ? 'L' : 'P';
        db.run(
          'INSERT INTO attendance (emp_code, emp_name, reporting_manager, billing_month, day_number, status) VALUES (?, ?, ?, ?, ?, ?)',
          [rec.emp_code, rec.emp_name, rec.manager, billingMonth, day, status]
        );
      }
    }
  });

  const attendanceRecords = [
    { emp_code: 'EMP001', emp_name: 'Arun Kumar', manager: 'Vikram Singh', leaveDays: [5, 12] },
    { emp_code: 'EMP002', emp_name: 'Sneha Reddy', manager: 'Vikram Singh', leaveDays: [8] },
    { emp_code: 'EMP003', emp_name: 'Deepak Joshi', manager: 'Vikram Singh', leaveDays: [3, 15, 22] },
    { emp_code: 'TN001', emp_name: 'Kavitha M', manager: 'Suresh R', leaveDays: [] },
    { emp_code: 'TN002', emp_name: 'Rajesh N', manager: 'Suresh R', leaveDays: [10, 20] },
    { emp_code: 'GE001', emp_name: 'Anita Sharma', manager: 'Pooja Gupta', leaveDays: [7] },
    { emp_code: 'GE002', emp_name: 'Mohit Verma', manager: 'Pooja Gupta', leaveDays: [14, 21] },
  ];

  insertAttendance(attendanceRecords);
  console.log(`  Attendance: ${attendanceRecords.length} employees for ${billingMonth}`);

  // Quotes
  const { lastInsertRowid: quoteId } = db.run(
    `INSERT INTO quotes (quote_number, client_id, quote_date, valid_until, subtotal, tax_percent, tax_amount, total_amount, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['QT-2026-001', clientIds[0], '2026-02-01', '2026-03-01', 160000, 18, 28800, 188800, 'Accepted', 'Monthly staffing for Q1']
  );

  const quoteItems = [
    { desc: 'Arun Kumar - Monthly Resource', qty: 1, unit_rate: 50000, amount: 50000 },
    { desc: 'Sneha Reddy - Monthly Resource', qty: 1, unit_rate: 65000, amount: 65000 },
    { desc: 'Deepak Joshi - Monthly Resource', qty: 1, unit_rate: 45000, amount: 45000 },
  ];

  for (const item of quoteItems) {
    db.run(
      'INSERT INTO quote_items (quote_id, description, quantity, unit_rate, amount) VALUES (?, ?, ?, ?, ?)',
      [quoteId, item.desc, item.qty, item.unit_rate, item.amount]
    );
  }
  console.log(`  Quote: QT-2026-001 with ${quoteItems.length} items`);

  // Purchase Order
  db.run(
    `INSERT INTO purchase_orders (po_number, client_id, quote_id, po_date, start_date, end_date, po_value, consumed_value, alert_threshold, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['PO-ACME-2026-001', clientIds[0], quoteId, '2026-02-05', '2026-02-01', '2026-07-31', 960000, 188800, 80, 'Active', 'H1 2026 Staffing PO']
  );
  console.log('  Purchase Order: PO-ACME-2026-001');

  console.log('\nSeed completed successfully!');
  db.close();
  process.exit(0);
}

seed();
