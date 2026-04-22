/**
 * Seed script - populates the Supabase database with sample data for development.
 * Usage: npm run db:seed
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../config/database');

async function seed() {
  console.log('Seeding database...');

  // Clear existing data (order matters due to foreign keys)
  const tables = [
    'billing_errors', 'billing_items', 'billing_runs',
    'po_consumption_log',
    'quote_items', 'quotes',
    'attendance', 'rate_cards',
    'purchase_orders',
    'audit_log', 'clients',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', 0);
    if (error) console.warn(`  Warning clearing ${table}: ${error.message}`);
  }

  // Clients
  const clients = [
    { client_name: 'Acme Corporation', abbreviation: 'ACME', contact_person: 'John Smith', email: 'john@acme.com', phone: '9876543210', address: 'Mumbai, Maharashtra' },
    { client_name: 'TechNova Solutions', abbreviation: 'TNS', contact_person: 'Priya Patel', email: 'priya@technova.in', phone: '9876543211', address: 'Bangalore, Karnataka' },
    { client_name: 'GlobalEdge Consulting', abbreviation: 'GEC', contact_person: 'Rahul Mehta', email: 'rahul@globaledge.com', phone: '9876543212', address: 'Delhi, NCR' },
  ];

  const { data: insertedClients, error: clientErr } = await supabase
    .from('clients')
    .insert(clients)
    .select('id, client_name');

  if (clientErr) throw new Error(`Client insert failed: ${clientErr.message}`);
  const clientIds = insertedClients.map(c => c.id);
  insertedClients.forEach(c => console.log(`  Client: ${c.client_name} (id=${c.id})`));

  // Quote (needed before PO)
  const { data: quoteRow, error: qErr } = await supabase
    .from('quotes')
    .insert({
      quote_number: 'QT-2026-001',
      client_id: clientIds[0],
      quote_date: '2026-02-01',
      valid_until: '2026-03-01',
      total_amount: 160000,
      status: 'Accepted',
      notes: 'Monthly staffing for Q1',
    })
    .select('id')
    .single();

  if (qErr) throw new Error(`Quote insert failed: ${qErr.message}`);
  const quoteId = quoteRow.id;

  const quoteItems = [
    { quote_id: quoteId, description: 'Arun Kumar - Monthly Resource', quantity: 1, unit_rate: 50000, amount: 50000 },
    { quote_id: quoteId, description: 'Sneha Reddy - Monthly Resource', quantity: 1, unit_rate: 65000, amount: 65000 },
    { quote_id: quoteId, description: 'Deepak Joshi - Monthly Resource', quantity: 1, unit_rate: 45000, amount: 45000 },
  ];

  const { error: qiErr } = await supabase.from('quote_items').insert(quoteItems);
  if (qiErr) throw new Error(`Quote items insert failed: ${qiErr.message}`);
  console.log(`  Quote: QT-2026-001 with ${quoteItems.length} items`);

  // Purchase Order (needed before rate_cards for po_id FK)
  const { data: poRow, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: 'PO-ACME-2026-001',
      client_id: clientIds[0],
      quote_id: quoteId,
      po_date: '2026-02-05',
      start_date: '2026-02-01',
      end_date: '2026-07-31',
      po_value: 960000,
      consumed_value: 188800,
      alert_threshold: 80,
      status: 'Active',
      notes: 'H1 2026 Staffing PO',
    })
    .select('id')
    .single();

  if (poErr) throw new Error(`PO insert failed: ${poErr.message}`);
  const poId = poRow.id;
  console.log(`  Purchase Order: PO-ACME-2026-001 (id=${poId})`);

  // Rate Cards (Acme employees linked to PO, others unassigned)
  const rateCards = [
    { client_id: clientIds[0], emp_code: 'EMP001', emp_name: 'Arun Kumar', doj: '2024-01-15', reporting_manager: 'Vikram Singh', monthly_rate: 50000, leaves_allowed: 2, po_id: poId },
    { client_id: clientIds[0], emp_code: 'EMP002', emp_name: 'Sneha Reddy', doj: '2024-03-01', reporting_manager: 'Vikram Singh', monthly_rate: 65000, leaves_allowed: 2, po_id: poId },
    { client_id: clientIds[0], emp_code: 'EMP003', emp_name: 'Deepak Joshi', doj: '2024-06-10', reporting_manager: 'Vikram Singh', monthly_rate: 45000, leaves_allowed: 1, po_id: poId },
    { client_id: clientIds[1], emp_code: 'TN001', emp_name: 'Kavitha M', doj: '2024-02-20', reporting_manager: 'Suresh R', monthly_rate: 75000, leaves_allowed: 2 },
    { client_id: clientIds[1], emp_code: 'TN002', emp_name: 'Rajesh N', doj: '2024-04-15', reporting_manager: 'Suresh R', monthly_rate: 55000, leaves_allowed: 1 },
    { client_id: clientIds[2], emp_code: 'GE001', emp_name: 'Anita Sharma', doj: '2024-05-01', reporting_manager: 'Pooja Gupta', monthly_rate: 80000, leaves_allowed: 2 },
    { client_id: clientIds[2], emp_code: 'GE002', emp_name: 'Mohit Verma', doj: '2024-07-10', reporting_manager: 'Pooja Gupta', monthly_rate: 60000, leaves_allowed: 2 },
  ];

  const { error: rcErr } = await supabase.from('rate_cards').insert(rateCards);
  if (rcErr) throw new Error(`Rate card insert failed: ${rcErr.message}`);
  console.log(`  Rate cards: ${rateCards.length} inserted (3 linked to PO)`);

  // Attendance for last month (Feb 2026)
  const billingMonth = '202602';
  const daysInMonth = 28;

  const attendanceRecords = [
    { emp_code: 'EMP001', emp_name: 'Arun Kumar', manager: 'Vikram Singh', leaveDays: [5, 12] },
    { emp_code: 'EMP002', emp_name: 'Sneha Reddy', manager: 'Vikram Singh', leaveDays: [8] },
    { emp_code: 'EMP003', emp_name: 'Deepak Joshi', manager: 'Vikram Singh', leaveDays: [3, 15, 22] },
    { emp_code: 'TN001', emp_name: 'Kavitha M', manager: 'Suresh R', leaveDays: [] },
    { emp_code: 'TN002', emp_name: 'Rajesh N', manager: 'Suresh R', leaveDays: [10, 20] },
    { emp_code: 'GE001', emp_name: 'Anita Sharma', manager: 'Pooja Gupta', leaveDays: [7] },
    { emp_code: 'GE002', emp_name: 'Mohit Verma', manager: 'Pooja Gupta', leaveDays: [14, 21] },
  ];

  const attendanceRows = [];
  for (const rec of attendanceRecords) {
    for (let day = 1; day <= daysInMonth; day++) {
      attendanceRows.push({
        emp_code: rec.emp_code,
        emp_name: rec.emp_name,
        reporting_manager: rec.manager,
        billing_month: billingMonth,
        day_number: day,
        status: rec.leaveDays.includes(day) ? 'L' : 'P',
      });
    }
  }

  const { error: attErr } = await supabase.from('attendance').insert(attendanceRows);
  if (attErr) throw new Error(`Attendance insert failed: ${attErr.message}`);
  console.log(`  Attendance: ${attendanceRecords.length} employees for ${billingMonth}`);

  console.log('\nSeed completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
