const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

if (!fs.existsSync(env.outputDir)) {
  fs.mkdirSync(env.outputDir, { recursive: true });
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
    { header: 'Monthly Rate', key: 'monthly_rate', width: 15 },
    { header: 'Allowed Leaves', key: 'allowed_leaves', width: 15 },
    { header: 'Leaves Taken', key: 'leaves_taken', width: 15 },
    { header: 'Chargeable Days', key: 'chargeable_days', width: 18 },
    { header: 'Invoice Amount', key: 'invoice_amount', width: 18 },
    { header: 'GST %', key: 'gst_percent', width: 10 },
    { header: 'GST Amount', key: 'gst_amount', width: 15 },
    { header: 'Total with GST', key: 'total_with_gst', width: 18 },
  ];

  // Style header row
  const headerRow = billingSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
  headerRow.alignment = { horizontal: 'center' };

  for (const item of billingItems) {
    billingSheet.addRow(item);
  }

  // Format currency columns
  billingSheet.getColumn('monthly_rate').numFmt = '#,##0.00';
  billingSheet.getColumn('invoice_amount').numFmt = '#,##0.00';
  billingSheet.getColumn('gst_amount').numFmt = '#,##0.00';
  billingSheet.getColumn('total_with_gst').numFmt = '#,##0.00';
  billingSheet.getColumn('gst_percent').numFmt = '0.00';

  // Auto-filter
  billingSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: billingItems.length + 1, column: 12 },
  };

  // Add totals row
  if (billingItems.length > 0) {
    const totalInvoice = billingItems.reduce((sum, item) => sum + item.invoice_amount, 0);
    const totalGst = billingItems.reduce((sum, item) => sum + item.gst_amount, 0);
    const totalWithGst = billingItems.reduce((sum, item) => sum + item.total_with_gst, 0);
    const totalRow = billingSheet.addRow({
      client_name: 'TOTAL',
      invoice_amount: totalInvoice,
      gst_amount: totalGst,
      total_with_gst: totalWithGst,
    });
    totalRow.font = { bold: true };
    totalRow.getCell('invoice_amount').numFmt = '#,##0.00';
    totalRow.getCell('gst_amount').numFmt = '#,##0.00';
    totalRow.getCell('total_with_gst').numFmt = '#,##0.00';
  }

  // Sheet 2: Error_Report
  const errorSheet = workbook.addWorksheet('Error_Report');
  errorSheet.columns = [
    { header: 'Emp Code', key: 'emp_code', width: 15 },
    { header: 'Error Message', key: 'error_message', width: 60 },
  ];

  const errorHeaderRow = errorSheet.getRow(1);
  errorHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  errorHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };

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
