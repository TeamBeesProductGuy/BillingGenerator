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
  po_number: ['po_number', 'ponumber', 'po', 'purchase_order', 'purchaseorder', 'po_no'],
  date_of_reporting: ['date_of_reporting', 'dateofreporting', 'reporting_date', 'reportingdate'],
};

const ATTENDANCE_ALIASES = {
  emp_code: ['emp_code', 'empcode', 'employee_code', 'employeecode', 'emp_id', 'empid'],
  emp_name: ['emp_name', 'empname', 'employee_name', 'employeename', 'name'],
  reporting_manager: ['reporting_manager', 'reportingmanager', 'manager', 'rm'],
};

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

  const requiredFields = ['emp_code', 'emp_name', 'monthly_rate', 'leaves_allowed'];
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

    let doj = getValue('doj');
    if (doj instanceof Date) {
      doj = doj.toISOString().split('T')[0];
    } else if (doj) {
      doj = String(doj).trim();
    }

    let dateOfReporting = getValue('date_of_reporting');
    if (dateOfReporting instanceof Date) {
      dateOfReporting = dateOfReporting.toISOString().split('T')[0];
    } else if (dateOfReporting) {
      dateOfReporting = String(dateOfReporting).trim();
    }

    records.push({
      client_name: String(getValue('client_name') || '').trim(),
      emp_code: empCodeStr,
      emp_name: String(getValue('emp_name') || '').trim(),
      doj: doj || null,
      reporting_manager: String(getValue('reporting_manager') || '').trim(),
      monthly_rate: monthlyRate,
      leaves_allowed: leavesAllowed,
      po_number: String(getValue('po_number') || '').trim() || null,
      date_of_reporting: dateOfReporting || null,
    });
  }

  return { records, errors };
}

async function parseAttendance(filePath, billingMonth) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet || worksheet.rowCount === 0) {
    return { records: [], errors: [{ emp_code: 'N/A', error_message: 'Attendance file is empty or has no sheets' }] };
  }

  const daysInMonth = getDaysInMonth(billingMonth);
  const headerRow = worksheet.getRow(1);
  const columnMap = {};
  const dayColumns = {};
  const errors = [];

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

  if (!columnMap.emp_code) {
    errors.push({ emp_code: 'N/A', error_message: 'Attendance missing required column: emp_code' });
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
    if (!empCode) continue;

    const empCodeStr = String(empCode).trim();
    if (!empCodeStr) continue;

    if (empCodes.has(empCodeStr)) {
      errors.push({ emp_code: empCodeStr, error_message: `Duplicate emp_code in Attendance at row ${rowNum}` });
      continue;
    }
    empCodes.add(empCodeStr);

    const days = {};
    let leavesTaken = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const col = dayColumns[day];
      if (!col) {
        days[day] = 'P';
        continue;
      }
      let val = row.getCell(col).value;
      if (val && typeof val === 'object' && val.result !== undefined) val = val.result;
      const status = String(val || '').trim().toUpperCase();
      if (status === 'L') {
        days[day] = 'L';
        leavesTaken++;
      } else {
        days[day] = 'P';
      }
    }

    records.push({
      emp_code: empCodeStr,
      emp_name: String(getValue('emp_name') || '').trim(),
      reporting_manager: String(getValue('reporting_manager') || '').trim(),
      days,
      leaves_taken: leavesTaken,
    });
  }

  return { records, errors };
}

module.exports = { parseRateCard, parseAttendance, getDaysInMonth };
