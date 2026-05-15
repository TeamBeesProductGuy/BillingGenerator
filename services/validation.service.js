function validateBillingMonth(billingMonth) {
  if (!billingMonth || !/^\d{6}$/.test(billingMonth)) {
    return 'Service month must be in YYYYMM format (e.g., 202602)';
  }
  const year = parseInt(billingMonth.substring(0, 4), 10);
  const month = parseInt(billingMonth.substring(4, 6), 10);
  if (year < 2020 || year > 2099) return 'Year must be between 2020 and 2099';
  if (month < 1 || month > 12) return 'Month must be between 01 and 12';
  return null;
}

function crossValidate(rateCards, attendanceRecords) {
  const errors = [];
  const rateCardEmpCodes = new Set(rateCards.map((r) => String(r.emp_code || '').trim()));
  const attendanceEmpCodes = new Set(attendanceRecords.map((a) => String(a.emp_code || '').trim()));

  for (const rc of rateCards) {
    if (!attendanceEmpCodes.has(rc.emp_code)) {
      errors.push({
        emp_code: rc.emp_code,
        emp_name: rc.emp_name || null,
        error_message: 'Attendance not found',
      });
    }
  }

  for (const att of attendanceRecords) {
    if (!rateCardEmpCodes.has(att.emp_code)) {
      errors.push({
        emp_code: att.emp_code,
        emp_name: att.emp_name || null,
        error_message: 'Rate card not found',
      });
    }
  }

  return errors;
}

module.exports = { validateBillingMonth, crossValidate };
