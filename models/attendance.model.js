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
