const { getDaysInMonth } = require('./excelParser.service');
const env = require('../config/env');

const SGTC_MONTHLY_HOURS = 170;
const SGTC_HOURS_PER_PRESENT_DAY = 8.5;

function normalizeClientName(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEmpCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEmpName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '');
}

function addUniqueMapEntry(map, duplicates, key, value) {
  if (!key) return;
  if (map.has(key)) {
    duplicates.add(key);
    map.delete(key);
    return;
  }
  if (!duplicates.has(key)) map.set(key, value);
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

function formatDateKeyForBilling(dateKey) {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[Math.max(0, Math.min(11, Number(month) - 1))] || month;
  return `${Number(day)}-${monthName}-${year}`;
}

function getActiveBillingDays(rc, billingYear, billingMon, daysInMonth, effectiveStartDay) {
  const activeDays = [];
  const notes = [];

  for (let day = effectiveStartDay; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(billingYear, billingMon, day);
    let isActive = true;

    if (rc.sow_item_valid_from && dateKey < rc.sow_item_valid_from) {
      isActive = false;
    }

    if (rc.sow_item_valid_to && dateKey > rc.sow_item_valid_to) {
      isActive = false;
    }

    if (rc.pause_billing && rc.pause_start_date && rc.pause_end_date && dateKey >= rc.pause_start_date && dateKey <= rc.pause_end_date) {
      isActive = false;
    }

    if (rc.disable_billing && rc.disable_from_date && dateKey >= rc.disable_from_date) {
      isActive = false;
    }

    if (isActive) activeDays.push(day);
  }

  const activeStartDate = activeDays.length > 0 ? toDateKey(billingYear, billingMon, activeDays[0]) : null;
  const activeEndDate = activeDays.length > 0 ? toDateKey(billingYear, billingMon, activeDays[activeDays.length - 1]) : null;
  const billingDuration = activeStartDate && activeEndDate
    ? `${formatDateKeyForBilling(activeStartDate)} to ${formatDateKeyForBilling(activeEndDate)}`
    : 'Outside SOW Role Duration';

  if (rc.pause_billing && rc.pause_start_date && rc.pause_end_date) {
    notes.push(`Paused ${rc.pause_start_date} to ${rc.pause_end_date}`);
  }
  if (rc.disable_billing && rc.disable_from_date) {
    notes.push(`Disabled from ${rc.disable_from_date}`);
  }
  if (rc.sow_item_valid_from || rc.sow_item_valid_to) {
    notes.push(`SOW role duration ${rc.sow_item_valid_from || 'open'} to ${rc.sow_item_valid_to || 'open'}`);
  }

  return { activeDays, status: billingDuration, notes, activeStartDate, activeEndDate };
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

function getExtraLeaveDays(leavesTaken, leavesAllowed) {
  const taken = Number(leavesTaken || 0);
  const allowed = Number(leavesAllowed || 0);
  if (!Number.isFinite(taken) || !Number.isFinite(allowed)) return 0;
  return Math.max(taken - allowed, 0);
}

function getSgtcBillingHours(leavesTaken, leavesAllowed, effectiveDays) {
  const activeDays = Number(effectiveDays || 0);
  if (!Number.isFinite(activeDays) || activeDays <= 0) return 0;
  const baseHours = Math.min(roundMoney(activeDays * SGTC_HOURS_PER_PRESENT_DAY), SGTC_MONTHLY_HOURS);
  const deductionHours = roundMoney(getExtraLeaveDays(leavesTaken, leavesAllowed) * SGTC_HOURS_PER_PRESENT_DAY);
  return Math.max(roundMoney(baseHours - deductionHours), 0);
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
  const attendanceNameMap = new Map();
  const duplicateAttendanceNames = new Set();

  for (const att of attendanceRecords) {
    const codeKey = normalizeEmpCode(att.emp_code);
    if (codeKey) attendanceMap.set(codeKey, att);
    addUniqueMapEntry(attendanceNameMap, duplicateAttendanceNames, normalizeEmpName(att.emp_name), att);
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

    const attendance = attendanceMap.get(normalizeEmpCode(rc.emp_code)) || attendanceNameMap.get(normalizeEmpName(rc.emp_name));
    if (!attendance) {
      errors.push({
        client_id: rc.client_id || null,
        client_name: rc.client_name || null,
        client_abbreviation: rc.client_abbreviation || rc.abbreviation || null,
        emp_code: rc.emp_code,
        emp_name: rc.emp_name || null,
        error_message: 'Attendance not found',
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
          client_id: rc.client_id || null,
          client_name: rc.client_name || null,
          client_abbreviation: rc.client_abbreviation || rc.abbreviation || null,
          emp_code: rc.emp_code,
          emp_name: rc.emp_name || null,
          error_message: `WARNING: Charging date ${rc.charging_date} is after service month ${billingMonth}`,
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
        client_id: rc.client_id || null,
        client_name: rc.client_name || null,
        client_abbreviation: rc.client_abbreviation || rc.abbreviation || null,
        emp_code: rc.emp_code,
        emp_name: rc.emp_name || null,
        error_message: `WARNING: SOW role inactive for service month ${billingMonth}`,
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
      billingHours = getSgtcBillingHours(leavesTaken, rc.leaves_allowed, effectiveDays);
      invoiceAmount = roundMoney((Number(rc.monthly_rate || 0) / SGTC_MONTHLY_HOURS) * billingHours);
      chargeableDays = roundMoney(billingHours / SGTC_HOURS_PER_PRESENT_DAY);
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
      doj: rc.doj || null,
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

module.exports = { calculateBilling, isSgtcHourlyProratedClient, getSgtcBillingHours };
