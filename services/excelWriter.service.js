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

function normalizeBillingItemsForExport(billingItems) {
  return (billingItems || []).map((item) => ({
    ...item,
    allowed_leaves: item.allowed_leaves !== undefined ? item.allowed_leaves : item.leaves_allowed,
    effective_days: item.effective_days !== undefined ? item.effective_days : item.days_in_month,
  }));
}

function cleanErrorMessage(message) {
  const text = String(message || '').trim();
  const isWarning = /^WARNING:/i.test(text);
  let clean = text.replace(/^WARNING:\s*/i, '').trim();

  if (/found in Rate Card but missing in Attendance/i.test(clean) || /No attendance record found/i.test(clean)) {
    clean = 'Attendance not found';
  } else if (/found in Attendance but missing in Rate Card/i.test(clean)) {
    clean = 'Rate card not found';
  } else if (/has no PO assignment/i.test(clean)) {
    clean = 'PO not assigned';
  } else if (/charging date .* after billing month/i.test(clean)) {
    clean = 'Charging date after service month';
  } else if (/SOW role duration is not active/i.test(clean)) {
    clean = 'SOW role inactive for service month';
  } else if (/Missing sow_number/i.test(clean)) {
    clean = 'SOW missing';
  } else if (/Invalid monthly_rate/i.test(clean)) {
    clean = 'Invalid monthly rate';
  } else if (/Invalid leaves_allowed/i.test(clean)) {
    clean = 'Invalid allowed leaves';
  } else if (/Missing emp_code/i.test(clean)) {
    clean = 'Employee code missing';
  }

  return isWarning && !clean.startsWith('WARNING:') ? `WARNING: ${clean}` : clean;
}

function getErrorEmpName(errorItem) {
  if (!errorItem) return '-';
  if (errorItem.emp_name) return errorItem.emp_name;
  const match = String(errorItem.error_message || '').match(/\(([^)]+)\)/);
  return match ? match[1] : '-';
}

function getErrorClient(errorItem) {
  if (!errorItem) return '-';
  return errorItem.client_abbreviation || errorItem.abbreviation || errorItem.client_name || '-';
}

function normalizeErrorsForExport(errors) {
  return (errors || []).map((err) => ({
    ...err,
    emp_name: getErrorEmpName(err),
    client_label: getErrorClient(err),
    error_message: cleanErrorMessage(err.error_message),
  }));
}

function billingMonthDate(billingMonth) {
  const raw = String(billingMonth || '');
  const year = parseInt(raw.substring(0, 4), 10);
  const month = parseInt(raw.substring(4, 6), 10);
  if (!year || !month) return null;
  return new Date(year, month - 1, 1);
}

function monthEndDate(date) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// Normalize any date (Date or YYYY-MM-DD string) to UTC midnight of its calendar
// day. ExcelJS serializes dates via UTC, so a local-midnight Date would land on
// the previous day in +UTC timezones (e.g. IST); this keeps day-level cells exact.
function toCalendarDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

// From date for a service month = the latest of the month start, the PO start,
// and the resource's charging date that still falls inside the month.
function serviceFromDate(item, monthStart, monthEnd) {
  const start = toCalendarDate(monthStart);
  const end = toCalendarDate(monthEnd);
  let from = start;
  const poStart = toCalendarDate(item.po_start_date);
  if (poStart && poStart > from && poStart <= end) from = poStart;
  const charge = toCalendarDate(item.charging_date);
  if (charge && charge > from && charge <= end) from = charge;
  return from;
}

// To date for a service month = the month end, pulled back to the PO end date
// when the PO finishes part-way through the month.
function serviceToDate(item, monthStart, monthEnd) {
  const start = toCalendarDate(monthStart);
  const end = toCalendarDate(monthEnd);
  let to = end;
  const poEnd = toCalendarDate(item.po_end_date);
  if (poEnd && poEnd < to && poEnd >= start) to = poEnd;
  return to;
}

function inferLocation(item) {
  const text = `${item.client_name || ''} ${item.client_abbreviation || ''}`.toUpperCase();
  if (text.includes('BLR') || text.includes('BANGALORE') || text.includes('BENGALURU')) return 'Bangalore';
  if (text.includes('GGN') || text.includes('GURGAON') || text.includes('GURUGRAM')) return 'Gurgaon';
  return '';
}

function buildServiceDescription(item) {
  const base = item.service_description || item.sow_number || item.emp_name || '';
  if (!item.emp_name || String(base).toUpperCase().includes(String(item.emp_name).toUpperCase())) return base;
  return `${base} (${item.emp_name})`;
}

function uniqueJoined(values, separator = ', ') {
  const seen = new Set();
  return (values || [])
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(separator);
}

function aggregateManagerRows(rows) {
  const groups = new Map();
  (rows || []).forEach((item) => {
    const key = [
      String(item.reporting_manager || '').trim().toLowerCase(),
      String(item.emp_code || '').trim().toLowerCase(),
      String(item.emp_name || '').trim().toLowerCase(),
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        ...item,
        invoice_amount: 0,
        billing_hours: 0,
        _sowNumbers: [],
        _serviceDescriptions: [],
      });
    }
    const existing = groups.get(key);
    existing.invoice_amount += Number(item.invoice_amount || 0);
    const billableHours = item.billing_hours !== null && item.billing_hours !== undefined
      ? Number(item.billing_hours || 0)
      : Math.round((Number(item.chargeable_days || 0) * 8.5) * 100) / 100;
    existing.billing_hours += billableHours;
    existing._sowNumbers.push(item.sow_number);
    existing._serviceDescriptions.push(item.service_description);
  });

  return Array.from(groups.values()).map((item) => ({
    ...item,
    invoice_amount: Math.round(Number(item.invoice_amount || 0) * 100) / 100,
    billing_hours: Math.round(Number(item.billing_hours || 0) * 100) / 100,
    sow_number: uniqueJoined(item._sowNumbers, ' & ') || item.sow_number,
    service_description: uniqueJoined(item._serviceDescriptions) || item.service_description,
    _sowNumbers: undefined,
    _serviceDescriptions: undefined,
  }));
}

function managerKey(value) {
  return String(value || 'Unassigned').trim() || 'Unassigned';
}

function populateBillingWorkbook(workbook, billingItems, errors, options = {}) {
  const normalizedItems = normalizeBillingItemsForExport(billingItems);
  const normalizedErrors = normalizeErrorsForExport(errors);
  const billingMonth = options.billingMonth || (normalizedItems[0] && normalizedItems[0].billing_month);
  const forMonth = billingMonthDate(billingMonth);
  const toDate = monthEndDate(forMonth);
  const includeOperationalSheets = options.includeOperationalSheets !== false;
  const includeErrorSheet = options.includeErrorSheet === true;

  if (includeOperationalSheets) {
  // Sheet 1: Service Request
  const billingSheet = workbook.addWorksheet('Service Request');

  // A run is single-client. SGTC clients bill by hours, everyone else by days, so
  // the whole sheet shows one set: hours columns for SGTC, work-day columns otherwise.
  const isSgtcSheet = normalizedItems.length > 0
    && normalizedItems.every((item) => item.billing_method === 'sgtc_hours');

  const columnDefs = [
    { key: 'sow_number', header: 'SOW No.', width: 15 },
    { key: 'po_number', header: 'PO', width: 18 },
    { key: 'po_date', header: 'PO Date', width: 14, numFmt: 'dd-mmm-yyyy' },
    { key: 'reporting_manager', header: 'Manager', width: 22 },
    { key: 'emp_name', header: 'Resource Name', width: 24 },
    { key: 'service_description', header: 'Service Desc', width: 45 },
    { key: 'monthly_rate', header: 'Monthly Rate (170 hrs)', width: 20, numFmt: '#,##0.00' },
    { key: 'for_month', header: 'Service Month', width: 14, numFmt: 'mmm-yyyy' },
    { key: 'from_date', header: 'From Date', width: 14, numFmt: 'dd-mmm-yyyy' },
    { key: 'to_date', header: 'To Date', width: 14, numFmt: 'dd-mmm-yyyy' },
    { key: 'effective_days', header: 'Total Work Days', width: 16, mode: 'days' },
    { key: 'leaves_taken', header: 'Leaves Taken', width: 14 },
    { key: 'leave_deduct', header: 'Leave Deduct', width: 14 },
    { key: 'chargeable_days', header: 'Actual Work Days', width: 17, mode: 'days' },
    { key: 'actual_work_hours', header: 'Actual Work Hours', width: 18, numFmt: '#,##0.00', mode: 'hours' },
    { key: 'billing_hours', header: 'Bill-able hours', width: 17, numFmt: '#,##0.00', mode: 'hours' },
    { key: 'invoice_amount', header: 'Bill-able Amt', width: 18, numFmt: '#,##0.00' },
    { key: 'client_name', header: 'Client', width: 24 },
    { key: 'location', header: 'Location', width: 14 },
  ].filter((col) => {
    if (col.mode === 'days') return !isSgtcSheet; // Total/Actual Work Days: non-SGTC sheets only
    if (col.mode === 'hours') return isSgtcSheet; // Actual/Bill-able hours: SGTC sheets only
    return true;
  });

  billingSheet.columns = columnDefs.map((col) => ({ key: col.key, width: col.width }));

  // The hours/day and monthly-hours constants only apply to SGTC (hours) sheets.
  if (isSgtcSheet) {
    billingSheet.getCell('A1').value = 'Hours / Day';
    billingSheet.getCell('B1').value = 8.5;
    billingSheet.getCell('A2').value = 'Billable Hours / Month (max)';
    billingSheet.getCell('B2').value = 170;
    billingSheet.getRow(1).font = { bold: true };
    billingSheet.getRow(2).font = { bold: true };
  }
  billingSheet.getCell('A3').value = 'Service Request:';
  billingSheet.getRow(3).font = { bold: true };

  billingSheet.getRow(4).values = columnDefs.map((col) => col.header);
  styleHeader(billingSheet.getRow(4), 'FF2F5496');

  for (const item of normalizedItems) {
    const actualHours = item.billing_hours !== null && item.billing_hours !== undefined
      ? item.billing_hours
      : Math.round((Number(item.chargeable_days || 0) * 8.5) * 100) / 100;
    billingSheet.addRow({
      ...item,
      po_number: item.po_number || 'PO to be added',
      po_date: toCalendarDate(item.po_date),
      service_description: buildServiceDescription(item),
      for_month: toCalendarDate(forMonth),
      from_date: serviceFromDate(item, forMonth, toDate),
      to_date: serviceToDate(item, forMonth, toDate),
      leave_deduct: 0,
      actual_work_hours: actualHours,
      billing_hours: actualHours,
      sow_number: item.sow_number || 'Not linked',
      location: inferLocation(item),
    });
  }

  columnDefs.forEach((col) => {
    if (col.numFmt) billingSheet.getColumn(col.key).numFmt = col.numFmt;
  });

  billingSheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: billingItems.length + 4, column: columnDefs.length },
  };

  if (billingItems.length > 0) {
    const totalInvoice = billingItems.reduce((sum, item) => sum + item.invoice_amount, 0);
    const totalRow = billingSheet.addRow({
      sow_number: 'TOTAL',
      invoice_amount: totalInvoice,
    });
    totalRow.font = { bold: true };
    totalRow.getCell('invoice_amount').numFmt = '#,##0.00';
  }

  // Sheet 2: Manager Approval Request
  const managerSheet = workbook.addWorksheet('Manager Approval Request');
  managerSheet.columns = [
    { width: 10 },
    { width: 50 },
    { width: 24 },
    { width: 22 },
    { width: 16 },
    { width: 28 },
    { width: 10 },
    { width: 24 },
  ];

  const managerGroups = new Map();
  normalizedItems.forEach((item) => {
    const key = managerKey(item.reporting_manager);
    if (!managerGroups.has(key)) managerGroups.set(key, []);
    managerGroups.get(key).push(item);
  });

  let currentRow = 1;
  [...managerGroups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([manager, rows]) => {
    const displayRows = aggregateManagerRows(rows);
    managerSheet.mergeCells(currentRow, 1, currentRow, 8);
    const titleCell = managerSheet.getCell(currentRow, 1);
    titleCell.value = manager;
    titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
    titleCell.alignment = { horizontal: 'left' };
    currentRow += 1;

    managerSheet.getRow(currentRow).values = [
      'S.No.',
      'Service Descriptions',
      "Manager's Name",
      'Billable No. of hours',
      'Service month',
      'Service billable Amount (INR)',
      '',
      'Resource Name',
    ];
    styleHeader(managerSheet.getRow(currentRow), 'FF2F5496');
    currentRow += 1;

    displayRows.forEach((item, index) => {
      const billableHours = item.billing_hours !== null && item.billing_hours !== undefined
        ? item.billing_hours
        : Math.round((Number(item.chargeable_days || 0) * 8.5) * 100) / 100;
      managerSheet.getRow(currentRow).values = [
        index + 1,
        buildServiceDescription(item),
        manager,
        billableHours,
        forMonth,
        item.invoice_amount,
        '',
        item.emp_name,
      ];
      currentRow += 1;
    });

    const managerTotal = displayRows.reduce((sum, item) => sum + Number(item.invoice_amount || 0), 0);
    const totalRow = managerSheet.getRow(currentRow);
    totalRow.values = ['', 'TOTAL', '', '', '', Math.round(managerTotal * 100) / 100];
    totalRow.font = { bold: true };
    currentRow += 2;
  });

  managerSheet.getColumn(4).numFmt = '#,##0.00';
  managerSheet.getColumn(5).numFmt = 'mmm-yyyy';
  managerSheet.getColumn(6).numFmt = '#,##0.00';

  if (normalizedItems.length > 0) {
    const grandInvoice = normalizedItems.reduce((sum, item) => sum + item.invoice_amount, 0);
    const totalRow = managerSheet.getRow(currentRow);
    totalRow.values = ['', 'GRAND TOTAL', '', '', '', Math.round(grandInvoice * 100) / 100];
    totalRow.font = { bold: true };
  }
  }

  if (includeErrorSheet) {
  // Error Report is downloaded separately, not included in the full service request workbook.
  const errorSheet = workbook.addWorksheet('Error Report');
  errorSheet.columns = [
    { header: 'Emp Code', key: 'emp_code', width: 15 },
    { header: 'Emp Name', key: 'emp_name', width: 24 },
    { header: 'Client', key: 'client_label', width: 18 },
    { header: 'Error Msg', key: 'error_message', width: 42 },
  ];

  styleHeader(errorSheet.getRow(1), 'FFC00000');

  for (const err of normalizedErrors) {
    errorSheet.addRow(err);
  }

  if (normalizedErrors.length === 0) {
    errorSheet.addRow({ emp_code: '-', emp_name: '-', client_label: '-', error_message: 'No errors found' });
  }
  }
}

async function generateBillingExcel(billingItems, errors, billingMonth) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing Engine';
  workbook.created = new Date();
  populateBillingWorkbook(workbook, billingItems, errors, { billingMonth, includeErrorSheet: false });

  const filename = `Service_Request_${billingMonth}.xlsx`;
  const filePath = path.join(env.outputDir, filename);
  await workbook.xlsx.writeFile(filePath);

  return { filePath, filename };
}

async function generateBillingWorksheetBuffer(billingItems, errors, worksheetKey, billingMonth) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing Engine';
  workbook.created = new Date();
  const isErrorReport = worksheetKey === 'error_report';
  populateBillingWorkbook(workbook, billingItems, errors, {
    billingMonth,
    includeOperationalSheets: !isErrorReport,
    includeErrorSheet: isErrorReport,
  });

  const sheetMap = {
    billing_working: 'Service Request',
    manager_summary: 'Manager Approval Request',
    error_report: 'Error Report',
  };
  const keepSheet = sheetMap[worksheetKey];
  if (!keepSheet) {
    throw new Error('Unknown worksheet requested');
  }

  workbook.worksheets.slice().forEach(function (sheet) {
    if (sheet.name !== keepSheet) workbook.removeWorksheet(sheet.id);
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateBillingExcel, generateBillingWorksheetBuffer };
