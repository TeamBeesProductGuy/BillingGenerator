const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

if (!fs.existsSync(env.outputDir)) {
  fs.mkdirSync(env.outputDir, { recursive: true });
}

function styleHeader(row, bgColor) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  row.alignment = { horizontal: 'center' };
}

async function generateBillingExcel(billingItems, errors, billingMonth) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing Engine';
  workbook.created = new Date();

  // Sheet 1: Billing_Working
  const billingSheet = workbook.addWorksheet('Billing_Working');
  billingSheet.columns = [
    { header: 'Client Name', key: 'client_name', width: 20 },
    { header: 'Reporting Manager', key: 'reporting_manager', width: 20 },
    { header: 'Emp Code', key: 'emp_code', width: 15 },
    { header: 'Emp Name', key: 'emp_name', width: 20 },
    { header: 'Charging Date', key: 'charging_date', width: 18 },
    { header: 'Monthly Rate', key: 'monthly_rate', width: 15 },
    { header: 'Allowed Leaves', key: 'allowed_leaves', width: 15 },
    { header: 'Leaves Taken', key: 'leaves_taken', width: 15 },
    { header: 'Effective Days', key: 'effective_days', width: 15 },
    { header: 'Chargeable Days', key: 'chargeable_days', width: 18 },
    { header: 'Invoice Amount', key: 'invoice_amount', width: 18 },
  ];

  styleHeader(billingSheet.getRow(1), 'FF2F5496');

  for (const item of billingItems) {
    billingSheet.addRow(item);
  }

  // Format currency columns
  billingSheet.getColumn('monthly_rate').numFmt = '#,##0.00';
  billingSheet.getColumn('invoice_amount').numFmt = '#,##0.00';

  // Auto-filter
  billingSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: billingItems.length + 1, column: 11 },
  };

  // Add totals row
  if (billingItems.length > 0) {
    const totalInvoice = billingItems.reduce((sum, item) => sum + item.invoice_amount, 0);
    const totalRow = billingSheet.addRow({
      client_name: 'TOTAL',
      invoice_amount: totalInvoice,
    });
    totalRow.font = { bold: true };
    totalRow.getCell('invoice_amount').numFmt = '#,##0.00';
  }

  // Sheet 2: Manager_Summary
  const managerSheet = workbook.addWorksheet('Manager_Summary');
  managerSheet.columns = [
    { header: 'Reporting Manager', key: 'reporting_manager', width: 25 },
    { header: 'Employee Count', key: 'employee_count', width: 18 },
    { header: 'Total Monthly Rate', key: 'total_monthly_rate', width: 20 },
    { header: 'Total Invoice Amount', key: 'total_invoice_amount', width: 22 },
  ];

  styleHeader(managerSheet.getRow(1), 'FF2F5496');

  // Group billing items by reporting_manager
  const managerMap = new Map();
  for (const item of billingItems) {
    const mgr = item.reporting_manager || 'Unassigned';
    if (!managerMap.has(mgr)) {
      managerMap.set(mgr, { employee_count: 0, total_monthly_rate: 0, total_invoice_amount: 0 });
    }
    const entry = managerMap.get(mgr);
    entry.employee_count += 1;
    entry.total_monthly_rate += item.monthly_rate;
    entry.total_invoice_amount += item.invoice_amount;
  }

  // Sort by manager name and add rows
  const sortedManagers = [...managerMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [mgr, data] of sortedManagers) {
    managerSheet.addRow({
      reporting_manager: mgr,
      employee_count: data.employee_count,
      total_monthly_rate: Math.round(data.total_monthly_rate * 100) / 100,
      total_invoice_amount: Math.round(data.total_invoice_amount * 100) / 100,
    });
  }

  managerSheet.getColumn('total_monthly_rate').numFmt = '#,##0.00';
  managerSheet.getColumn('total_invoice_amount').numFmt = '#,##0.00';

  // Totals row for manager summary
  if (sortedManagers.length > 0) {
    const grandEmpCount = billingItems.length;
    const grandMonthlyRate = billingItems.reduce((sum, item) => sum + item.monthly_rate, 0);
    const grandInvoice = billingItems.reduce((sum, item) => sum + item.invoice_amount, 0);
    const totalRow = managerSheet.addRow({
      reporting_manager: 'TOTAL',
      employee_count: grandEmpCount,
      total_monthly_rate: Math.round(grandMonthlyRate * 100) / 100,
      total_invoice_amount: Math.round(grandInvoice * 100) / 100,
    });
    totalRow.font = { bold: true };
  }

  // Sheet 3: Error_Report
  const errorSheet = workbook.addWorksheet('Error_Report');
  errorSheet.columns = [
    { header: 'Emp Code', key: 'emp_code', width: 15 },
    { header: 'Error Message', key: 'error_message', width: 60 },
  ];

  styleHeader(errorSheet.getRow(1), 'FFC00000');

  for (const err of errors) {
    errorSheet.addRow(err);
  }

  if (errors.length === 0) {
    errorSheet.addRow({ emp_code: '-', error_message: 'No errors found' });
  }

  const filename = `Billing_Working_For_${billingMonth}.xlsx`;
  const filePath = path.join(env.outputDir, filename);
  await workbook.xlsx.writeFile(filePath);

  return { filePath, filename };
}

module.exports = { generateBillingExcel };
