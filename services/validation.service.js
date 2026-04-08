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

function crossValidate(rateCards, attendanceRecords) {
  const errors = [];
  const rateCardEmpCodes = new Set(rateCards.map((r) => String(r.emp_code || '').trim()));
  const attendanceEmpCodes = new Set(attendanceRecords.map((a) => String(a.emp_code || '').trim()));

  for (const rc of rateCards) {
    if (!attendanceEmpCodes.has(rc.emp_code)) {
      errors.push({
        emp_code: rc.emp_code,
        error_message: `Employee ${rc.emp_code} (${rc.emp_name}) found in Rate Card but missing in Attendance`,
      });
    }
  }

  for (const att of attendanceRecords) {
    if (!rateCardEmpCodes.has(att.emp_code)) {
      errors.push({
        emp_code: att.emp_code,
        error_message: `Employee ${att.emp_code} (${att.emp_name}) found in Attendance but missing in Rate Card`,
      });
    }
  }

  return errors;
}

module.exports = { validateBillingMonth, crossValidate };
