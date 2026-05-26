const ExcelJS = require('exceljs');
const { getDaysInMonth } = require('./excelParser.service');

const LEGEND_ROWS = [
  ['PR', 'Present'],
  ['CL', 'Casual Leave'],
  ['SL', 'Sick Leave'],
  ['EL', 'Earned Leave'],
  ['HDL', 'Half Day Casual Leave'],
  ['HDS', 'Half Day Sick Leave'],
  ['HL', 'Holiday'],
  ['WO', 'Week Off'],
  ['A', 'Absent'],
  ['ODW', 'Off Day Working'],
  ['PRTO', 'Parental & Other Leaves'],
];

const FONT = { name: 'Verdana', family: 2, size: 12, color: { argb: 'FF000000' } };
const BOLD_FONT = { ...FONT, bold: true };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' }, bgColor: { argb: 'FF000000' } };
const TOTAL_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEB' }, bgColor: { argb: 'FF000000' } };
const SHADE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8AEE8' }, bgColor: { argb: 'FF000000' } };
const LEAVE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' }, bgColor: { argb: 'FF000000' } };
const PRESENT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' }, bgColor: { argb: 'FF000000' } };
const WHITE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' }, bgColor: { argb: 'FF000000' } };
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};
const MEDIUM_BORDER = {
  top: { style: 'medium', color: { argb: 'FF000000' } },
  left: { style: 'medium', color: { argb: 'FF000000' } },
  bottom: { style: 'medium', color: { argb: 'FF000000' } },
  right: { style: 'medium', color: { argb: 'FF000000' } },
};

function safeSheetName(value) {
  const raw = String(value || 'Attendance').replace(/[\\/*?:[\]]/g, ' ').trim();
  return (raw || 'Attendance').slice(0, 31);
}

function normalizeStoredAttendanceCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'P') return 'PR';
  if (normalized === 'WFH') return 'PR';
  if (normalized === 'HD') return 'HDL';
  if (normalized === 'WEEKOFF' || normalized === 'WEEK_OFF' || normalized === 'WEEK OFF' || normalized === 'W/O') return 'WO';
  return normalized;
}

function formatStatus(status, leaveUnits, attendanceCode) {
  const originalCode = normalizeStoredAttendanceCode(attendanceCode);
  if (originalCode) return originalCode;
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'P') return 'PR';
  if (normalized === 'L' && Number(leaveUnits) === 0.5) return 'HDL';
  if (normalized === 'L') return 'CL';
  if (normalized === 'WO') return 'WO';
  return normalized || 'PR';
}

function countLeaveUnits(codes) {
  return (codes || []).reduce((sum, code) => {
    const normalized = String(code || '').toUpperCase();
    if (['CL', 'SL', 'EL', 'A'].includes(normalized)) return sum + 1;
    if (['HDL', 'HDS'].includes(normalized)) return sum + 0.5;
    return sum;
  }, 0);
}

function formatTitleMonth(billingMonth) {
  const raw = String(billingMonth || '');
  if (!/^\d{6}$/.test(raw)) return '';
  const date = new Date(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long' }) + "'" + raw.slice(2, 4);
}

function weekdayLabel(year, month, day) {
  return new Date(year, month - 1, day).toLocaleString('en-US', { weekday: 'short' });
}

function excelDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function normalizeEmpCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEmpName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function buildAttendanceMap(attendanceRows) {
  const map = new Map();
  const nameMap = new Map();
  const duplicateNames = new Set();
  (attendanceRows || []).forEach((row) => {
    const codeKey = normalizeEmpCode(row.emp_code);
    if (codeKey) map.set(codeKey, row);
    const nameKey = normalizeEmpName(row.emp_name);
    if (!nameKey) return;
    if (nameMap.has(nameKey)) {
      duplicateNames.add(nameKey);
      return;
    }
    nameMap.set(nameKey, row);
  });
  duplicateNames.forEach((nameKey) => nameMap.delete(nameKey));
  return { byCode: map, byName: nameMap };
}

function findAttendance(attendanceLookup, candidate) {
  const codeKey = normalizeEmpCode(candidate.emp_code);
  const nameKey = normalizeEmpName(candidate.emp_name);
  return (codeKey && attendanceLookup.byCode.get(codeKey))
    || (nameKey && attendanceLookup.byName.get(nameKey))
    || {};
}

function uniqueCandidates(rows) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const key = [
      String(row.emp_code || '').trim().toUpperCase(),
      String(row.client_id || row.client_abbreviation || row.client_name || '').trim().toUpperCase(),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueClientLabel(rows) {
  const seen = new Set();
  const labels = [];
  (rows || []).forEach((row) => {
    const label = String(row.client_abbreviation || row.client_name || '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  });
  return labels.join(', ');
}

function applyBaseCell(cell, options = {}) {
  cell.font = options.bold ? BOLD_FONT : FONT;
  cell.alignment = {
    horizontal: options.horizontal || 'center',
    vertical: 'middle',
    wrapText: options.wrap !== false,
  };
  cell.border = options.border || THIN_BORDER;
  if (options.fill) cell.fill = options.fill;
}

function statusFill(code) {
  const normalized = String(code || '').toUpperCase();
  if (['WO', 'HL', 'PRTO'].includes(normalized)) return SHADE_FILL;
  if (['CL', 'SL', 'EL', 'HDL', 'HDS', 'A'].includes(normalized)) return LEAVE_FILL;
  return null;
}

function setupSheetColumns(ws) {
  const widths = [8, 34.21875, 16.21875, 13.77734375, 12.77734375];
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
  for (let column = 6; column <= 36; column += 1) {
    ws.getColumn(column).width = 8;
  }
  ws.getColumn(37).width = 12.33203125;
}

function setupHeaders(ws, billingMonth, daysInMonth) {
  const raw = String(billingMonth || '');
  const year = /^\d{6}$/.test(raw) ? Number(raw.slice(0, 4)) : new Date().getFullYear();
  const month = /^\d{6}$/.test(raw) ? Number(raw.slice(4, 6)) : new Date().getMonth() + 1;

  ws.getRow(2).height = 20.4;
  ws.getRow(3).height = 16.8;
  ws.getRow(4).height = 49.2;

  ws.getCell('B2').value = `Teambees Attendance -${formatTitleMonth(billingMonth)}`;
  ws.getCell('B2').font = { ...BOLD_FONT, size: 16 };
  ws.getCell('B2').alignment = { vertical: 'middle' };

  [
    ['A4', 'S.No'],
    ['B4', 'Employee Name'],
    ['C4', 'Manager'],
    ['D4', 'DOJ'],
    ['E4', 'DOR'],
    ['AK4', 'Total Leaves\nAvailed'],
  ].forEach(([address, value]) => {
    const cell = ws.getCell(address);
    cell.value = value;
    applyBaseCell(cell, { bold: true, fill: address === 'AK4' ? TOTAL_HEADER_FILL : HEADER_FILL, border: MEDIUM_BORDER });
  });

  for (let day = 1; day <= 31; day += 1) {
    const col = 5 + day;
    const dayCell = ws.getRow(3).getCell(col);
    const headerCell = ws.getRow(4).getCell(col);
    dayCell.value = day <= daysInMonth ? weekdayLabel(year, month, day) : '';
    headerCell.value = day <= daysInMonth ? day : '';
    applyBaseCell(dayCell, { bold: true, border: { ...THIN_BORDER, top: { style: 'medium', color: { argb: 'FF000000' } } } });
    applyBaseCell(headerCell, { bold: true, fill: HEADER_FILL, border: MEDIUM_BORDER });
  }
}

function writeCandidateRows(ws, candidates, attendanceLookup, daysInMonth) {
  candidates.forEach((candidate, index) => {
    const attendance = findAttendance(attendanceLookup, candidate);
    const rowNumber = index + 5;
    const row = ws.getRow(rowNumber);
    row.height = 35.4;

    [
      index + 1,
      candidate.emp_name || attendance.emp_name || '',
      candidate.reporting_manager || attendance.reporting_manager || '',
      excelDate(candidate.doj),
      excelDate(candidate.dor),
    ].forEach((value, cellIndex) => {
      const cell = row.getCell(cellIndex + 1);
      cell.value = value;
      applyBaseCell(cell, { wrap: cellIndex !== 1 });
      if (cellIndex === 3 || cellIndex === 4) cell.numFmt = 'd-mmm-yy';
    });

    const codes = [];
    for (let day = 1; day <= 31; day += 1) {
      const code = day <= daysInMonth
        ? formatStatus(
          attendance.days && attendance.days[day],
          attendance.day_leave_units && attendance.day_leave_units[day],
          attendance.attendance_codes && attendance.attendance_codes[day]
        )
        : '';
      const cell = row.getCell(5 + day);
      cell.value = code;
      codes.push(code);
      applyBaseCell(cell, { bold: Boolean(statusFill(code)), fill: statusFill(code) || undefined });
    }

    const totalCell = row.getCell(37);
    totalCell.value = countLeaveUnits(codes);
    applyBaseCell(totalCell);
    row.commit();
  });
}

function writeLegend(ws, candidateCount) {
  const legendStart = Math.max(39, candidateCount + 10);
  ws.mergeCells(legendStart, 1, legendStart, 2);
  const title = ws.getCell(legendStart, 1);
  title.value = 'LEGEND';
  applyBaseCell(title, { bold: true, fill: HEADER_FILL, border: MEDIUM_BORDER });
  ws.getRow(legendStart).height = 16.8;

  const headerRow = ws.getRow(legendStart + 1);
  headerRow.height = 16.8;
  headerRow.getCell(1).value = 'Code';
  headerRow.getCell(2).value = 'Meaning';
  applyBaseCell(headerRow.getCell(1), { bold: true, fill: HEADER_FILL, border: MEDIUM_BORDER });
  applyBaseCell(headerRow.getCell(2), { bold: true, fill: HEADER_FILL, border: MEDIUM_BORDER });

  LEGEND_ROWS.forEach((legend, index) => {
    const row = ws.getRow(legendStart + index + 2);
    row.height = 16.8;
    row.getCell(1).value = legend[0];
    row.getCell(2).value = legend[1];
    applyBaseCell(row.getCell(1), { bold: true, fill: statusFill(legend[0]) || PRESENT_FILL });
    applyBaseCell(row.getCell(2), { fill: WHITE_FILL });
  });

  const finalLegendRow = legendStart + LEGEND_ROWS.length + 1;
  for (let rowNumber = legendStart; rowNumber <= finalLegendRow; rowNumber += 1) {
    const left = ws.getRow(rowNumber).getCell(1);
    const right = ws.getRow(rowNumber).getCell(2);
    left.border = {
      ...left.border,
      left: { style: 'medium', color: { argb: 'FF000000' } },
    };
    right.border = {
      ...right.border,
      right: { style: 'medium', color: { argb: 'FF000000' } },
    };
    if (rowNumber === legendStart || rowNumber === finalLegendRow) {
      left.border = { ...left.border, top: rowNumber === legendStart ? MEDIUM_BORDER.top : left.border.top, bottom: rowNumber === finalLegendRow ? MEDIUM_BORDER.bottom : left.border.bottom };
      right.border = { ...right.border, top: rowNumber === legendStart ? MEDIUM_BORDER.top : right.border.top, bottom: rowNumber === finalLegendRow ? MEDIUM_BORDER.bottom : right.border.bottom };
    }
  }
}

async function generateManagerAttendanceWorkbook(rows, attendanceRows, options = {}) {
  const billingMonth = options.billingMonth || '';
  const managerName = options.managerName || 'Manager';
  const daysInMonth = /^\d{6}$/.test(String(billingMonth)) ? getDaysInMonth(String(billingMonth)) : 31;
  const attendanceByEmp = buildAttendanceMap(attendanceRows);
  const candidates = uniqueCandidates(rows);
  const clientLabel = uniqueClientLabel(rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing Engine';
  workbook.created = new Date();

  const ws = workbook.addWorksheet(safeSheetName(clientLabel || managerName || 'Attendance'));
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 5 }];
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.2,
      footer: 0.2,
    },
  };
  setupSheetColumns(ws);
  setupHeaders(ws, billingMonth, daysInMonth);
  writeCandidateRows(ws, candidates, attendanceByEmp, daysInMonth);
  writeLegend(ws, candidates.length);
  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: 37 },
  };

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateManagerAttendanceWorkbook };
