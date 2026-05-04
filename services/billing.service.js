const { getDaysInMonth } = require('./excelParser.service');
const env = require('../config/env');

const SGTC_MONTHLY_HOURS = 170;
const SGTC_HOURS_PER_PRESENT_DAY = 8.5;

function normalizeClientName(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isSgtcHourlyProratedClient(rateCard) {
  const clientKey = normalizeClientName(`${rateCard.client_name || ''} ${rateCard.client_abbreviation || ''} ${rateCard.abbreviation || ''}`);
  const isSgtcClient = clientKey.includes('SGTC')
    || clientKey.includes('STRYKERGLOBALTECHNOLOGYCENTER');

  return isSgtcClient
    && (
      clientKey.includes('GGN')
      || clientKey.includes('GURGAON')
      || clientKey.includes('GURUGRAM')
      || clientKey.includes('BLR')
      || clientKey.includes('BANGALORE')
      || clientKey.includes('BENGALURU')
      || clientKey.includes('STRYKERGLOBALTECHNOLOGYCENTER')
    );
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function toDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getActiveBillingDays(rc, billingYear, billingMon, daysInMonth, effectiveStartDay) {
  const activeDays = [];
  let status = 'Active';
  const notes = [];

  for (let day = effectiveStartDay; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(billingYear, billingMon, day);
    let isActive = true;

    if (rc.sow_item_valid_from && dateKey < rc.sow_item_valid_from) {
      isActive = false;
      status = 'Outside SOW Role Duration';
    }

    if (rc.sow_item_valid_to && dateKey > rc.sow_item_valid_to) {
      isActive = false;
      status = 'Outside SOW Role Duration';
    }

    if (rc.pause_billing && rc.pause_start_date && rc.pause_end_date && dateKey >= rc.pause_start_date && dateKey <= rc.pause_end_date) {
      isActive = false;
      status = 'Paused';
    }

    if (rc.disable_billing && rc.disable_from_date && dateKey >= rc.disable_from_date) {
      isActive = false;
      status = 'Disabled';
    }

    if (isActive) activeDays.push(day);
  }

  if (rc.pause_billing && rc.pause_start_date && rc.pause_end_date) {
    notes.push(`Paused ${rc.pause_start_date} to ${rc.pause_end_date}`);
  }
  if (rc.disable_billing && rc.disable_from_date) {
    notes.push(`Disabled from ${rc.disable_from_date}`);
  }
  if (rc.sow_item_valid_from || rc.sow_item_valid_to) {
    notes.push(`SOW role duration ${rc.sow_item_valid_from || 'open'} to ${rc.sow_item_valid_to || 'open'}`);
  }

  return { activeDays, status, notes };
}

function sumLeaveUnitsForDays(attendance, activeDays, fallbackLeavesTaken) {
  if (attendance.day_leave_units && typeof attendance.day_leave_units === 'object') {
    return activeDays.reduce((sum, day) => {
      const units = Number(attendance.day_leave_units[day] || 0);
      return sum + (Number.isFinite(units) ? units : 0);
    }, 0);
  }
  return Number(fallbackLeavesTaken || 0);
}

function getAttendancePresentDays(attendance, activeDays, fallbackActiveDays, leavesTaken) {
  if (attendance.days_present !== undefined && attendance.days_present !== null) {
    const presentDays = Number(attendance.days_present);
    if (Number.isFinite(presentDays) && (!attendance.days || !activeDays)) return presentDays;
  }

  if (attendance.days && typeof attendance.days === 'object' && activeDays) {
    return activeDays.reduce((sum, day) => {
      const status = attendance.days[day];
      const normalized = String(status || '').toUpperCase();
      if (normalized === 'P') return sum + 1;
      if (normalized === 'L' && attendance.day_leave_units) {
        return sum + Math.max(1 - Number(attendance.day_leave_units[day] || 1), 0);
      }
      return sum;
    }, 0);
  }

  return Math.max(fallbackActiveDays - Number(leavesTaken || 0), 0);
}

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
    if (rc.sow_status === 'Inactive' || rc.po_status === 'Inactive') {
      continue;
    }

    if (rc.no_invoice || rc.billing_active === false) {
      continue;
    }

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
    let effectiveStartDay = 1;
    if (rc.charging_date) {
      const chargeDate = new Date(rc.charging_date);
      if (chargeDate > billingMonthEnd) {
        // Charging date is after this billing month — skip billing
        errors.push({
          emp_code: rc.emp_code,
          error_message: `WARNING: ${rc.emp_code} (${rc.emp_name}) charging date is ${rc.charging_date}, which is after billing month ${billingMonth}. Skipped.`,
        });
        continue;
      }
      if (chargeDate.getFullYear() === billingYear && (chargeDate.getMonth() + 1) === billingMon) {
        // Charging date is within billing month — pro-rata from that day
        effectiveDays = daysInMonth - chargeDate.getDate() + 1;
        effectiveStartDay = chargeDate.getDate();
      }
    }

    const activeWindow = getActiveBillingDays(rc, billingYear, billingMon, daysInMonth, effectiveStartDay);
    effectiveDays = activeWindow.activeDays.length;
    if (effectiveDays === 0) {
      errors.push({
        emp_code: rc.emp_code,
        error_message: `WARNING: ${rc.emp_code} (${rc.emp_name}) skipped because SOW role duration is not active for billing month ${billingMonth}.`,
      });
      continue;
    }
    const leavesTaken = sumLeaveUnitsForDays(attendance, activeWindow.activeDays, attendance.leaves_taken);
    const presentDays = getAttendancePresentDays(attendance, activeWindow.activeDays, effectiveDays, leavesTaken);
    let chargeableDays = effectiveDays - leavesTaken + rc.leaves_allowed;
    chargeableDays = Math.min(chargeableDays, 30, effectiveDays); // Never bill outside the active billing window.
    chargeableDays = Math.max(chargeableDays, 0);   // Prevent negative
    let billingHours = null;
    let invoiceAmount = roundMoney((chargeableDays / divisor) * rc.monthly_rate);
    let billing_method = 'days';

    if (isSgtcHourlyProratedClient(rc)) {
      billingHours = Math.min(roundMoney(presentDays * SGTC_HOURS_PER_PRESENT_DAY), SGTC_MONTHLY_HOURS);
      invoiceAmount = roundMoney((Number(rc.monthly_rate || 0) / SGTC_MONTHLY_HOURS) * billingHours);
      chargeableDays = presentDays;
      billing_method = 'sgtc_hours';
    }

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
      days_present: presentDays,
      billing_hours: billingHours,
      billing_method,
      billing_status: activeWindow.status,
      billing_note: activeWindow.notes.join('; '),
      days_in_month: daysInMonth,
      effective_days: effectiveDays,
      chargeable_days: chargeableDays,
      invoice_amount: invoiceAmount,
      po_id: rc.po_id || null,
      po_number: rc.po_number || null,
      po_date: rc.po_date || null,
      service_description: rc.service_description || null,
      client_abbreviation: rc.client_abbreviation || rc.abbreviation || null,
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
      sgtcMonthlyHours: SGTC_MONTHLY_HOURS,
      sgtcHoursPerPresentDay: SGTC_HOURS_PER_PRESENT_DAY,
    },
  };
}

module.exports = { calculateBilling, isSgtcHourlyProratedClient };
