const router = require('express').Router();
const ExcelJS = require('exceljs');

/**
 * Apply standard header styling to a worksheet's first row.
 * Bold white text on a blue (#2F5496) background.
 */
function styleHeaderRow(worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5496' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.commit();
}

// ---------------------------------------------------------------------------
// GET /api/samples/rate-card
// ---------------------------------------------------------------------------
router.get('/rate-card', async (_req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Rate Card');

    // Define columns
    ws.columns = [
      { header: 'client_name', key: 'client_name', width: 18 },
      { header: 'emp_code', key: 'emp_code', width: 12 },
      { header: 'emp_name', key: 'emp_name', width: 20 },
      { header: 'doj', key: 'doj', width: 14 },
      { header: 'reporting_manager', key: 'reporting_manager', width: 20 },
      { header: 'monthly_rate', key: 'monthly_rate', width: 15 },
      { header: 'leaves_allowed', key: 'leaves_allowed', width: 16 },
      { header: 'po_number', key: 'po_number', width: 18 },
      { header: 'date_of_reporting', key: 'date_of_reporting', width: 18 },
    ];

    // Sample data (po_number must match an Active PO for the client to link)
    const rows = [
      { client_name: 'Acme Corp', emp_code: 'EMP001', emp_name: 'Alice Johnson', doj: '2023-01-15', reporting_manager: 'Bob Smith', monthly_rate: 50000, leaves_allowed: 2, po_number: 'PO-2025-001', date_of_reporting: '2023-01-15' },
      { client_name: 'Acme Corp', emp_code: 'EMP002', emp_name: 'Charlie Brown', doj: '2023-03-20', reporting_manager: 'Bob Smith', monthly_rate: 60000, leaves_allowed: 1, po_number: 'PO-2025-001', date_of_reporting: '2023-03-20' },
      { client_name: 'Acme Corp', emp_code: 'EMP003', emp_name: 'Diana Prince', doj: '2024-06-01', reporting_manager: 'Alice Johnson', monthly_rate: 45000, leaves_allowed: 2, po_number: '', date_of_reporting: '2024-06-01' },
      { client_name: 'Acme Corp', emp_code: 'EMP004', emp_name: 'Edward Norton', doj: '2022-11-10', reporting_manager: 'Bob Smith', monthly_rate: 70000, leaves_allowed: 3, po_number: 'PO-2025-002', date_of_reporting: '2022-11-10' },
      { client_name: 'Acme Corp', emp_code: 'EMP005', emp_name: 'Fiona Apple', doj: '2024-01-05', reporting_manager: 'Alice Johnson', monthly_rate: 55000, leaves_allowed: 2, po_number: '', date_of_reporting: '2024-01-05' },
    ];

    ws.addRows(rows);

    // Style the header row
    styleHeaderRow(ws);

    // Enable auto-filter across all columns
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ws.columns.length },
    };

    // Stream the workbook directly to the response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Sample_Rate_Card.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating sample rate card:', err);
    res.status(500).json({ error: 'Failed to generate sample rate card' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/samples/attendance
// ---------------------------------------------------------------------------
router.get('/attendance', async (_req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Attendance');

    // Build columns: emp_code, emp_name, reporting_manager, then days 1..31
    const columns = [
      { header: 'emp_code', key: 'emp_code', width: 12 },
      { header: 'emp_name', key: 'emp_name', width: 20 },
      { header: 'reporting_manager', key: 'reporting_manager', width: 20 },
    ];

    for (let d = 1; d <= 31; d++) {
      columns.push({ header: String(d), key: `day_${d}`, width: 5 });
    }

    ws.columns = columns;

    // Employee definitions with their leave days (28-day month, days 29-31 empty)
    const employees = [
      { emp_code: 'EMP001', emp_name: 'Alice Johnson', reporting_manager: 'Bob Smith', leaveDays: [5, 12] },
      { emp_code: 'EMP002', emp_name: 'Charlie Brown', reporting_manager: 'Bob Smith', leaveDays: [10, 20, 25] },
      { emp_code: 'EMP003', emp_name: 'Diana Prince', reporting_manager: 'Alice Johnson', leaveDays: [] },
      { emp_code: 'EMP004', emp_name: 'Edward Norton', reporting_manager: 'Bob Smith', leaveDays: [1, 2, 3, 15] },
      { emp_code: 'EMP005', emp_name: 'Fiona Apple', reporting_manager: 'Alice Johnson', leaveDays: [7] },
    ];

    const TOTAL_DAYS = 28; // 28-day month; days 29-31 left empty

    for (const emp of employees) {
      const row = {
        emp_code: emp.emp_code,
        emp_name: emp.emp_name,
        reporting_manager: emp.reporting_manager,
      };

      for (let d = 1; d <= 31; d++) {
        if (d > TOTAL_DAYS) {
          row[`day_${d}`] = '';
        } else {
          row[`day_${d}`] = emp.leaveDays.includes(d) ? 'L' : 'P';
        }
      }

      ws.addRow(row);
    }

    // Style the header row
    styleHeaderRow(ws);

    // Enable auto-filter across all columns
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ws.columns.length },
    };

    // Stream the workbook directly to the response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Sample_Attendance.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating sample attendance:', err);
    res.status(500).json({ error: 'Failed to generate sample attendance' });
  }
});

module.exports = router;
