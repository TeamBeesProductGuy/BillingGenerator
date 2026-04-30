const { supabase } = require('../config/database');

const AttendanceModel = {
  async findByMonth(empCode, billingMonth) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('emp_code', empCode)
      .eq('billing_month', billingMonth)
      .order('day_number');
    if (error) throw new Error(error.message);
    return data;
  },

  async bulkUpsert(records) {
    const rows = records.map((rec) => ({
      emp_code: rec.emp_code,
      emp_name: rec.emp_name || null,
      reporting_manager: rec.reporting_manager || null,
      billing_month: rec.billing_month,
      day_number: rec.day_number,
      status: rec.status,
      leave_units: rec.leave_units !== undefined
        ? rec.leave_units
        : (String(rec.status || '').toUpperCase() === 'L' ? 1 : 0),
    }));
    let { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'emp_code,billing_month,day_number' });
    if (error && error.message && (error.message.includes('attendance_status_check') || error.message.includes('attendance_leave_units_check'))) {
      throw new Error('WO attendance requires DB migration 016 (attendance status WO). Please run the latest migration in Supabase first.');
    }
    // Backward compatibility for databases where leave_units is not added yet.
    if (error && error.message && error.message.includes('leave_units')) {
      const hasHalfDay = rows.some((row) => Number(row.leave_units) === 0.5);
      if (hasHalfDay) {
        throw new Error('Half-day attendance requires DB migration 006 (leave_units). Please run the latest migration in Supabase first.');
      }
      const fallbackRows = rows.map((row) => {
        const copy = { ...row };
        delete copy.leave_units;
        return copy;
      });
      ({ error } = await supabase
        .from('attendance')
        .upsert(fallbackRows, { onConflict: 'emp_code,billing_month,day_number' }));
    }
    if (error) throw new Error(error.message);
  },

  async getLeaveCount(empCode, billingMonth) {
    const { data, error } = await supabase
      .from('attendance')
      .select('status, leave_units')
      .eq('emp_code', empCode)
      .eq('billing_month', billingMonth);
    if (error) throw new Error(error.message);
    return (data || []).reduce((sum, row) => {
      if (row.status !== 'L') return sum;
      const units = Number(row.leave_units);
      return sum + (Number.isFinite(units) ? units : 1);
    }, 0);
  },

  async getSummary(billingMonth) {
    const { data, error } = await supabase
      .rpc('get_attendance_summary', { p_billing_month: billingMonth });
    if (error) throw new Error(error.message);
    return data;
  },

  async getDetailedByMonth(billingMonth, empCodes) {
    let query = supabase
      .from('attendance')
      .select('*')
      .eq('billing_month', billingMonth)
      .order('emp_code')
      .order('day_number');
    if (Array.isArray(empCodes) && empCodes.length > 0) {
      query = query.in('emp_code', empCodes);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const grouped = new Map();
    (data || []).forEach((row) => {
      const key = String(row.emp_code || '').trim();
      if (!grouped.has(key)) {
        grouped.set(key, {
          emp_code: row.emp_code,
          emp_name: row.emp_name,
          reporting_manager: row.reporting_manager,
          days: {},
          day_leave_units: {},
          leaves_taken: 0,
          days_present: 0,
        });
      }
      const rec = grouped.get(key);
      const day = Number(row.day_number);
      const status = String(row.status || 'P').toUpperCase();
      const leaveUnits = Number(row.leave_units || 0);
      rec.days[day] = status;
      rec.day_leave_units[day] = leaveUnits;
      if (status === 'L') {
        rec.leaves_taken += leaveUnits;
        rec.days_present += Math.max(1 - leaveUnits, 0);
      } else if (status === 'P') {
        rec.days_present += 1;
      }
    });

    return Array.from(grouped.values()).map((rec) => ({
      ...rec,
      leaves_taken: Math.round(rec.leaves_taken * 100) / 100,
      days_present: Math.round(rec.days_present * 100) / 100,
      billable_hours: Math.round(rec.days_present * 8.5 * 100) / 100,
    }));
  },

  async deleteByEmpMonth(empCode, billingMonth) {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('emp_code', empCode)
      .eq('billing_month', billingMonth);
    if (error) throw new Error(error.message);
  },

  async deleteByMonth(billingMonth) {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('billing_month', billingMonth);
    if (error) throw new Error(error.message);
  },

  async getEmployeeList(billingMonth) {
    const { data, error } = await supabase
      .from('attendance')
      .select('emp_code, emp_name')
      .eq('billing_month', billingMonth)
      .order('emp_code');
    if (error) throw new Error(error.message);
    // Deduplicate
    const seen = new Set();
    return data.filter((r) => {
      if (seen.has(r.emp_code)) return false;
      seen.add(r.emp_code);
      return true;
    });
  },
};

module.exports = AttendanceModel;
