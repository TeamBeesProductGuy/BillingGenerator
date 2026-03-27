const { getDaysInMonth } = require('./excelParser.service');
const env = require('../config/env');

function calculateBilling(rateCards, attendanceRecords, billingMonth) {
  const daysInMonth = getDaysInMonth(billingMonth);
  const divisor = env.billingDivisor === '30' ? 30 : daysInMonth;
  const billingYear = parseInt(billingMonth.substring(0, 4), 10);
  const billingMon = parseInt(billingMonth.substring(4, 6), 10);
  const billingMonthEnd = new Date(billingYear, billingMon, 0); // last day of billing month
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

    // Pro-rata: if charging_date falls within the billing month, bill from that date
    let effectiveDays = daysInMonth;
    if (rc.charging_date) {
      const chargeDate = new Date(rc.charging_date);
      if (chargeDate > billingMonthEnd) {
        // Charging date is after this billing month — skip billing
        errors.push({
          emp_code: rc.emp_code,
          error_message: `${rc.emp_code} (${rc.emp_name}) charging date is ${rc.charging_date}, which is after billing month ${billingMonth}. Skipped.`,
        });
        continue;
      }
      if (chargeDate.getFullYear() === billingYear && (chargeDate.getMonth() + 1) === billingMon) {
        // Charging date is within billing month — pro-rata from that day
        effectiveDays = daysInMonth - chargeDate.getDate() + 1;
      }
    }

    const leavesTaken = attendance.leaves_taken;
    let chargeableDays = effectiveDays - leavesTaken + rc.leaves_allowed;
    chargeableDays = Math.min(chargeableDays, 30); // Cap at 30
    chargeableDays = Math.max(chargeableDays, 0);   // Prevent negative
    const invoiceAmount = Math.round((chargeableDays / divisor) * rc.monthly_rate * 100) / 100;

    billingItems.push({
      client_id: rc.client_id || null,
      client_name: rc.client_name,
      sow_id: rc.sow_id || null,
      sow_number: rc.sow_number || null,
      reporting_manager: rc.reporting_manager || attendance.reporting_manager,
      emp_code: rc.emp_code,
      emp_name: rc.emp_name,
      charging_date: rc.charging_date || null,
      monthly_rate: rc.monthly_rate,
      allowed_leaves: rc.leaves_allowed,
      leaves_taken: leavesTaken,
      days_in_month: daysInMonth,
      effective_days: effectiveDays,
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
