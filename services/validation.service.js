function validateBillingMonth(billingMonth) {
  if (!billingMonth || !/^\d{6}$/.test(billingMonth)) {
    return 'Billing month must be in YYYYMM format (e.g., 202602)';
  }
  const year = parseInt(billingMonth.substring(0, 4), 10);
  const month = parseInt(billingMonth.substring(4, 6), 10);
  if (year < 2020 || year > 2099) return 'Year must be between 2020 and 2099';
  if (month < 1 || month > 12) return 'Month must be between 01 and 12';
  return null;
}

function normalizeEmpCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEmpName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function buildUniqueNameSet(rows) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const key = normalizeEmpName(row.emp_name);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set(Array.from(counts.entries()).filter((entry) => entry[1] === 1).map((entry) => entry[0]));
}

function crossValidate(rateCards, attendanceRecords) {
  const errors = [];
  const rateCardEmpCodes = new Set(rateCards.map((r) => normalizeEmpCode(r.emp_code)).filter(Boolean));
  const attendanceEmpCodes = new Set(attendanceRecords.map((a) => normalizeEmpCode(a.emp_code)).filter(Boolean));
  const uniqueRateCardNames = buildUniqueNameSet(rateCards);
  const uniqueAttendanceNames = buildUniqueNameSet(attendanceRecords);

  for (const rc of rateCards) {
    const codeMatched = attendanceEmpCodes.has(normalizeEmpCode(rc.emp_code));
    const nameMatched = uniqueAttendanceNames.has(normalizeEmpName(rc.emp_name));
    if (!codeMatched && !nameMatched) {
      errors.push({
        emp_code: rc.emp_code,
        error_message: `Employee ${rc.emp_code} (${rc.emp_name}) found in Rate Card but missing in Attendance`,
      });
    }
  }

  for (const att of attendanceRecords) {
    const codeMatched = rateCardEmpCodes.has(normalizeEmpCode(att.emp_code));
    const nameMatched = uniqueRateCardNames.has(normalizeEmpName(att.emp_name));
    if (!codeMatched && !nameMatched) {
      errors.push({
        emp_code: att.emp_code,
        error_message: `Employee ${att.emp_code} (${att.emp_name}) found in Attendance but missing in Rate Card`,
      });
    }
  }

  return errors;
}

module.exports = { validateBillingMonth, crossValidate };
