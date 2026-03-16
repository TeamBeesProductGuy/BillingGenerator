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
    }));
    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'emp_code,billing_month,day_number' });
    if (error) throw new Error(error.message);
  },

  async getLeaveCount(empCode, billingMonth) {
    const { count, error } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('emp_code', empCode)
      .eq('billing_month', billingMonth)
      .eq('status', 'L');
    if (error) throw new Error(error.message);
    return count || 0;
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
