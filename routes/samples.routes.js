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

    // Define columns expected by the current upload parser.
    ws.columns = [
      { header: 'client_name', key: 'client_name', width: 18 },
      { header: 'emp_code', key: 'emp_code', width: 12 },
      { header: 'emp_name', key: 'emp_name', width: 20 },
      { header: 'doj', key: 'doj', width: 14 },
      { header: 'reporting_manager', key: 'reporting_manager', width: 20 },
      { header: 'monthly_rate', key: 'monthly_rate', width: 15 },
      { header: 'leaves_allowed', key: 'leaves_allowed', width: 16 },
      { header: 'sow_number', key: 'sow_number', width: 20 },
      { header: 'po_number', key: 'po_number', width: 18 },
      { header: 'charging_date', key: 'charging_date', width: 18 },
    ];

    // Sample data for the current schema.
    // sow_number is required.
    // po_number is optional and, if provided, should match an Active PO for the client.
    const rows = [
      { client_name: 'Acme Corp', emp_code: 'EMP001', emp_name: 'Alice Johnson', doj: '2023-01-15', reporting_manager: 'Bob Smith', monthly_rate: 50000, leaves_allowed: 2, sow_number: 'SOW-20260319-001', po_number: 'PO-20260326-001', charging_date: '2023-01-15' },
      { client_name: 'Acme Corp', emp_code: 'EMP002', emp_name: 'Charlie Brown', doj: '2023-03-20', reporting_manager: 'Bob Smith', monthly_rate: 60000, leaves_allowed: 1, sow_number: 'SOW-20260319-001', po_number: 'PO-20260326-001', charging_date: '2023-03-20' },
      { client_name: 'Acme Corp', emp_code: 'EMP003', emp_name: 'Diana Prince', doj: '2024-06-01', reporting_manager: 'Alice Johnson', monthly_rate: 45000, leaves_allowed: 2, sow_number: 'SOW-20260319-002', po_number: '', charging_date: '2024-06-01' },
      { client_name: 'Acme Corp', emp_code: 'EMP004', emp_name: 'Edward Norton', doj: '2022-11-10', reporting_manager: 'Bob Smith', monthly_rate: 70000, leaves_allowed: 3, sow_number: 'SOW-20260319-001', po_number: 'PO-20260326-002', charging_date: '2022-11-10' },
      { client_name: 'Acme Corp', emp_code: 'EMP005', emp_name: 'Fiona Apple', doj: '2024-01-05', reporting_manager: 'Alice Johnson', monthly_rate: 55000, leaves_allowed: 2, sow_number: 'SOW-20260319-002', po_number: '', charging_date: '2024-01-05' },
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

    // Build columns expected by the current attendance upload parser:
    // emp_code, emp_name, reporting_manager, then day columns 1..31.
    const columns = [
      { header: 'emp_code', key: 'emp_code', width: 12 },
      { header: 'emp_name', key: 'emp_name', width: 20 },
      { header: 'reporting_manager', key: 'reporting_manager', width: 20 },
    ];

    for (let d = 1; d <= 31; d++) {
      columns.push({ header: String(d), key: `day_${d}`, width: 5 });
    }

    ws.columns = columns;

    // Employee definitions aligned with the sample rate card.
    const employees = [
      { emp_code: 'EMP001', emp_name: 'Alice Johnson', reporting_manager: 'Bob Smith', leaveDays: [5, 12] },
      { emp_code: 'EMP002', emp_name: 'Charlie Brown', reporting_manager: 'Bob Smith', leaveDays: [10, 20, 25] },
      { emp_code: 'EMP003', emp_name: 'Diana Prince', reporting_manager: 'Alice Johnson', leaveDays: [] },
      { emp_code: 'EMP004', emp_name: 'Edward Norton', reporting_manager: 'Bob Smith', leaveDays: [1, 2, 3, 15] },
      { emp_code: 'EMP005', emp_name: 'Fiona Apple', reporting_manager: 'Alice Johnson', leaveDays: [7] },
    ];

    const TOTAL_DAYS = 31;

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
