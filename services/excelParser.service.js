const ExcelJS = require('exceljs');

function normalizeHeader(header) {
  if (header === null || header === undefined) return '';
  return String(header).trim().toLowerCase().replace(/\s+/g, '_');
}

const RATE_CARD_ALIASES = {
  client_name: ['client_name', 'clientname', 'client'],
  emp_code: ['emp_code', 'empcode', 'employee_code', 'employeecode', 'emp_id', 'empid'],
  emp_name: ['emp_name', 'empname', 'employee_name', 'employeename', 'name'],
  doj: ['doj', 'date_of_joining', 'dateofjoining', 'joining_date'],
  reporting_manager: ['reporting_manager', 'reportingmanager', 'manager', 'rm'],
  monthly_rate: ['monthly_rate', 'monthlyrate', 'rate', 'billing_rate', 'billingrate'],
  leaves_allowed: ['leaves_allowed', 'leavesallowed', 'allowed_leaves', 'allowedleaves', 'leaves'],
  sow_number: ['sow_number', 'sow', 'sow_id', 'sowid'],
  po_number: ['po_number', 'ponumber', 'po', 'purchase_order', 'purchaseorder', 'po_no'],
  charging_date: ['charging_date', 'chargingdate', 'date_of_reporting', 'dateofreporting', 'reporting_date', 'reportingdate', 'date_of_reporting'],
};

const ATTENDANCE_ALIASES = {
  emp_code: ['emp_code', 'empcode', 'employee_code', 'employeecode', 'emp_id', 'empid'],
  emp_name: ['emp_name', 'empname', 'employee_name', 'employeename', 'name'],
  reporting_manager: ['reporting_manager', 'reportingmanager', 'manager', 'rm'],
};

const ATTENDANCE_PRESENT_CODES = new Set(['P', 'PR', 'ODW', 'WFH']);
// Weekend off and holiday leave are paid days, not leave days.
const ATTENDANCE_FULL_LEAVE_CODES = new Set(['L', 'CL', 'SL', 'EL', 'PRTO', 'A']);
const ATTENDANCE_HALF_LEAVE_CODES = new Set(['HDL', 'HDS', 'HD']);

function resolveColumn(normalizedHeader, aliases) {
  for (const [field, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(normalizedHeader)) return field;
  }
  return null;
}

function getDaysInMonth(billingMonth) {
  const year = parseInt(billingMonth.substring(0, 4), 10);
  const month = parseInt(billingMonth.substring(4, 6), 10);
  return new Date(year, month, 0).getDate();
}

function readCellValue(cellValue) {
  if (cellValue && typeof cellValue === 'object') {
    if (cellValue.result !== undefined) return cellValue.result;
    if (cellValue.text !== undefined) return cellValue.text;
    if (cellValue.richText) return cellValue.richText.map((chunk) => chunk.text).join('');
  }
  return cellValue;
}

function normalizeEmployeeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function mapAttendanceCode(rawValue) {
  const code = String(rawValue || '').trim().toUpperCase();
  if (!code) return { status: 'P', leaveUnits: 0 };
  if (ATTENDANCE_HALF_LEAVE_CODES.has(code)) return { status: 'L', leaveUnits: 0.5 };
  if (ATTENDANCE_FULL_LEAVE_CODES.has(code)) return { status: 'L', leaveUnits: 1 };
  if (ATTENDANCE_PRESENT_CODES.has(code)) return { status: 'P', leaveUnits: 0 };
  return { status: 'P', leaveUnits: 0 };
}

function detectAttendanceHeaderRow(worksheet) {
  const maxScanRows = Math.min(worksheet.rowCount, 25);
  for (let rowNum = 1; rowNum <= maxScanRows; rowNum++) {
    const row = worksheet.getRow(rowNum);
    let hasEmpIdentity = false;
    let dayColumnCount = 0;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = readCellValue(cell.value);
      const normalized = normalizeHeader(raw);
      const field = resolveColumn(normalized, ATTENDANCE_ALIASES);
      if (field === 'emp_code' || field === 'emp_name') {
        hasEmpIdentity = true;
      }
      const dayNum = parseInt(String(raw || '').trim(), 10);
      if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
        dayColumnCount += 1;
      }
    });

    if (hasEmpIdentity && dayColumnCount > 0) return rowNum;
  }
  return 1;
}

function buildAttendanceNameLookup(rateCards) {
  const lookup = new Map();
  const duplicateNames = new Set();
  (rateCards || []).forEach((record) => {
    const key = normalizeEmployeeName(record.emp_name);
    if (!key) return;
    if (lookup.has(key) && lookup.get(key).emp_code !== record.emp_code) {
      duplicateNames.add(key);
    } else if (!lookup.has(key)) {
      lookup.set(key, {
        emp_code: String(record.emp_code || '').trim(),
        emp_name: String(record.emp_name || '').trim(),
        reporting_manager: String(record.reporting_manager || '').trim(),
      });
    }
  });
  duplicateNames.forEach((key) => lookup.delete(key));
  return lookup;
}

async function parseRateCard(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet || worksheet.rowCount === 0) {
    return { records: [], errors: [{ emp_code: 'N/A', error_message: 'Rate Card file is empty or has no sheets' }] };
  }

  const headerRow = worksheet.getRow(1);
  const columnMap = {};
  const errors = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(cell.value);
    const field = resolveColumn(normalized, RATE_CARD_ALIASES);
    if (field) {
      columnMap[field] = colNumber;
    }
  });

  const requiredFields = ['emp_code', 'emp_name', 'monthly_rate', 'leaves_allowed', 'sow_number'];
  const missingFields = requiredFields.filter((f) => !(f in columnMap));
  if (missingFields.length > 0) {
    errors.push({
      emp_code: 'N/A',
      error_message: `Rate Card missing required columns: ${missingFields.join(', ')}`,
    });
    return { records: [], errors };
  }

  const records = [];
  const empCodes = new Set();

  for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const getValue = (field) => {
      const col = columnMap[field];
      if (!col) return null;
      const val = row.getCell(col).value;
      if (val && typeof val === 'object' && val.result !== undefined) return val.result;
      if (val && typeof val === 'object' && val.text) return val.text;
      return val;
    };

    const empCode = getValue('emp_code');
    if (!empCode && !getValue('emp_name')) continue; // skip empty rows

    const empCodeStr = String(empCode || '').trim();
    if (!empCodeStr) {
      errors.push({ emp_code: `Row ${rowNum}`, error_message: 'Missing emp_code' });
      continue;
    }

    if (empCodes.has(empCodeStr)) {
      errors.push({ emp_code: empCodeStr, error_message: `Duplicate emp_code in Rate Card at row ${rowNum}` });
      continue;
    }
    empCodes.add(empCodeStr);

    const monthlyRate = parseFloat(getValue('monthly_rate'));
    if (isNaN(monthlyRate) || monthlyRate <= 0) {
      errors.push({ emp_code: empCodeStr, error_message: `Invalid monthly_rate: ${getValue('monthly_rate')}` });
      continue;
    }

    const leavesAllowed = parseInt(getValue('leaves_allowed'), 10);
    if (isNaN(leavesAllowed) || leavesAllowed < 0) {
      errors.push({ emp_code: empCodeStr, error_message: `Invalid leaves_allowed: ${getValue('leaves_allowed')}` });
      continue;
    }

    const sowNumber = String(getValue('sow_number') || '').trim();
    if (!sowNumber) {
      errors.push({ emp_code: empCodeStr, error_message: 'Missing sow_number. A SOW is required for every employee.' });
      continue;
    }
    const poNumber = String(getValue('po_number') || '').trim();

    let doj = getValue('doj');
    if (doj instanceof Date) {
      doj = doj.toISOString().split('T')[0];
    } else if (doj) {
      doj = String(doj).trim();
    }

    let chargingDate = getValue('charging_date');
    if (chargingDate instanceof Date) {
      chargingDate = chargingDate.toISOString().split('T')[0];
    } else if (chargingDate) {
      chargingDate = String(chargingDate).trim();
    }

    records.push({
      client_name: String(getValue('client_name') || '').trim(),
      emp_code: empCodeStr,
      emp_name: String(getValue('emp_name') || '').trim(),
      doj: doj || null,
      reporting_manager: String(getValue('reporting_manager') || '').trim(),
      monthly_rate: monthlyRate,
      leaves_allowed: leavesAllowed,
      sow_number: sowNumber,
      po_number: poNumber,
      charging_date: chargingDate || null,
    });
  }

  return { records, errors };
}

async function parseAttendance(filePath, billingMonth, options = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet || worksheet.rowCount === 0) {
    return { records: [], errors: [{ emp_code: 'N/A', error_message: 'Attendance file is empty or has no sheets' }] };
  }

  const daysInMonth = getDaysInMonth(billingMonth);
  const headerRowNumber = detectAttendanceHeaderRow(worksheet);
  const headerRow = worksheet.getRow(headerRowNumber);
  const columnMap = {};
  const dayColumns = {};
  const errors = [];
  const nameLookup = buildAttendanceNameLookup(options.rateCards);

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cell.value;
    const normalized = normalizeHeader(raw);

    const field = resolveColumn(normalized, ATTENDANCE_ALIASES);
    if (field) {
      columnMap[field] = colNumber;
      return;
    }

    const dayNum = parseInt(String(raw).trim(), 10);
    if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
      dayColumns[dayNum] = colNumber;
    }
  });

  if (!columnMap.emp_code && !columnMap.emp_name) {
    errors.push({ emp_code: 'N/A', error_message: 'Attendance missing required column: emp_code or employee_name' });
    return { records: [], errors };
  }

  const records = [];
  const empCodes = new Set();

  for (let rowNum = headerRowNumber + 1; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const getValue = (field) => {
      const col = columnMap[field];
      if (!col) return null;
      return readCellValue(row.getCell(col).value);
    };

    const rowLabel = String(readCellValue(row.getCell(1).value) || '').trim().toUpperCase();
    if (rowLabel === 'LEGEND' || rowLabel === 'CODE') break;

    const empCodeRaw = getValue('emp_code');
    const empNameRaw = getValue('emp_name');
    const empNameStr = String(empNameRaw || '').trim();
    if (!empCodeRaw && !empNameStr) continue;

    let empCodeStr = String(empCodeRaw || '').trim();
    let resolvedName = empNameStr;
    let resolvedManager = String(getValue('reporting_manager') || '').trim();

    if (!empCodeStr) {
      const key = normalizeEmployeeName(empNameStr);
      const match = key ? nameLookup.get(key) : null;
      if (!match) {
        errors.push({ emp_code: `Row ${rowNum}`, error_message: `Unable to resolve emp_code for "${empNameStr}". Add emp_code column or ensure unique name in rate card upload.` });
        continue;
      }
      empCodeStr = match.emp_code;
      resolvedName = resolvedName || match.emp_name;
      resolvedManager = resolvedManager || match.reporting_manager;
    }

    if (empCodes.has(empCodeStr)) {
      errors.push({ emp_code: empCodeStr, error_message: `Duplicate emp_code in Attendance at row ${rowNum}` });
      continue;
    }
    empCodes.add(empCodeStr);

    const days = {};
    const dayLeaveUnits = {};
    let leavesTaken = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const col = dayColumns[day];
      if (!col) {
        days[day] = 'P';
        dayLeaveUnits[day] = 0;
        continue;
      }
      const val = readCellValue(row.getCell(col).value);
      const mapped = mapAttendanceCode(val);
      days[day] = mapped.status;
      dayLeaveUnits[day] = mapped.leaveUnits;
      leavesTaken += mapped.leaveUnits;
    }

    records.push({
      emp_code: empCodeStr,
      emp_name: resolvedName,
      reporting_manager: resolvedManager,
      days,
      day_leave_units: dayLeaveUnits,
      leaves_taken: leavesTaken,
    });
  }

  return { records, errors };
}

module.exports = { parseRateCard, parseAttendance, getDaysInMonth };
