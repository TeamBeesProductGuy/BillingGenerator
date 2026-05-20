const ExcelJS = require('exceljs');
const { getDaysInMonth } = require('./excelParser.service');

const LEGEND_ROWS = [
  ['P', 'Present / payable day'],
  ['L', 'Full leave / absent day'],
  ['HD', 'Half-day leave'],
  ['WO', 'Weekly off / non-billable day'],
];

function safeSheetName(value) {
  const raw = String(value || 'Attendance').replace(/[\\/*?:[\]]/g, ' ').trim();
  return (raw || 'Attendance').slice(0, 31);
}

function formatStatus(status, leaveUnits) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'L' && Number(leaveUnits) === 0.5) return 'HD';
  return normalized || 'P';
}

function buildAttendanceMap(attendanceRows) {
  const map = new Map();
  (attendanceRows || []).forEach((row) => {
    const key = String(row.emp_code || '').trim().toUpperCase();
    if (key) map.set(key, row);
  });
  return map;
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

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FF1F1F1F' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5B638' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1F1F1F' } },
      bottom: { style: 'thin', color: { argb: 'FF1F1F1F' } },
    };
  });
}

async function generateManagerAttendanceWorkbook(rows, attendanceRows, options = {}) {
  const billingMonth = options.billingMonth || '';
  const managerName = options.managerName || 'Manager';
  const daysInMonth = /^\d{6}$/.test(String(billingMonth)) ? getDaysInMonth(String(billingMonth)) : 31;
  const attendanceByEmp = buildAttendanceMap(attendanceRows);
  const candidates = uniqueCandidates(rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing Engine';
  workbook.created = new Date();

  const ws = workbook.addWorksheet(safeSheetName(`Attendance ${managerName}`));
  const columns = [
    { header: 'Client', key: 'client', width: 16 },
    { header: 'emp_code', key: 'emp_code', width: 14 },
    { header: 'emp_name', key: 'emp_name', width: 24 },
    { header: 'reporting_manager', key: 'reporting_manager', width: 24 },
  ];
  for (let day = 1; day <= daysInMonth; day += 1) {
    columns.push({ header: String(day), key: `day_${day}`, width: 5 });
  }
  ws.columns = columns;
  styleHeader(ws.getRow(1));
  ws.getRow(1).height = 24;

  candidates.forEach((candidate) => {
    const attendance = attendanceByEmp.get(String(candidate.emp_code || '').trim().toUpperCase()) || {};
    const row = {
      client: candidate.client_abbreviation || candidate.client_name || '',
      emp_code: candidate.emp_code || attendance.emp_code || '',
      emp_name: candidate.emp_name || attendance.emp_name || '',
      reporting_manager: candidate.reporting_manager || attendance.reporting_manager || '',
    };
    for (let day = 1; day <= daysInMonth; day += 1) {
      row[`day_${day}`] = formatStatus(attendance.days && attendance.days[day], attendance.day_leave_units && attendance.day_leave_units[day]);
    }
    ws.addRow(row);
  });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const legendStart = candidates.length + 4;
  ws.getCell(legendStart, 1).value = 'Legend';
  ws.getCell(legendStart, 1).font = { bold: true };
  LEGEND_ROWS.forEach((legend, index) => {
    const row = ws.getRow(legendStart + index + 1);
    row.getCell(1).value = legend[0];
    row.getCell(2).value = legend[1];
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE6E0D6' } },
        bottom: { style: 'thin', color: { argb: 'FFE6E0D6' } },
      };
    });
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateManagerAttendanceWorkbook };
