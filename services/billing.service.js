const { getDaysInMonth } = require('./excelParser.service');
const env = require('../config/env');

function calculateBilling(rateCards, attendanceRecords, billingMonth) {
  const daysInMonth = getDaysInMonth(billingMonth);
  const divisor = env.billingDivisor === '30' ? 30 : daysInMonth;
  const attendanceMap = new Map();

  for (const att of attendanceRecords) {
    attendanceMap.set(att.emp_code, att);
  }

  const billingItems = [];
  const errors = [];

  for (const rc of rateCards) {
    const attendance = attendanceMap.get(rc.emp_code);
    if (!attendance) {
      errors.push({
        emp_code: rc.emp_code,
        error_message: `No attendance record found for ${rc.emp_code} (${rc.emp_name})`,
      });
      continue;
    }

    const leavesTaken = attendance.leaves_taken;
    const chargeableDays = daysInMonth - leavesTaken + rc.leaves_allowed;
    const invoiceAmount = Math.round((chargeableDays / divisor) * rc.monthly_rate * 100) / 100;

    billingItems.push({
      client_name: rc.client_name,
      reporting_manager: rc.reporting_manager || attendance.reporting_manager,
      emp_code: rc.emp_code,
      emp_name: rc.emp_name,
      monthly_rate: rc.monthly_rate,
      allowed_leaves: rc.leaves_allowed,
      leaves_taken: leavesTaken,
      days_in_month: daysInMonth,
      chargeable_days: chargeableDays,
      invoice_amount: invoiceAmount,
      po_id: rc.po_id || null,
    });
  }

  const totalAmount = Math.round(billingItems.reduce((sum, item) => sum + item.invoice_amount, 0) * 100) / 100;

  return {
    billingItems,
    errors,
    summary: {
      totalEmployees: billingItems.length,
      totalAmount,
      errorCount: errors.length,
      daysInMonth,
      billingMonth,
      divisor,
    },
  };
}

module.exports = { calculateBilling };
