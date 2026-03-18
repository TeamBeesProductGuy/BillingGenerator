const { supabase } = require('../config/database');

const BillingModel = {
  async createRun(data) {
    const { data: row, error } = await supabase
      .from('billing_runs')
      .insert({
        billing_month: data.billing_month,
        client_id: data.client_id || null,
        total_employees: data.total_employees,
        total_amount: data.total_amount,
        error_count: data.error_count,
        output_file: data.output_file,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return row.id;
  },

  async addItems(runId, items) {
    const rows = items.map((item) => ({
      billing_run_id: runId,
      client_name: item.client_name,
      emp_code: item.emp_code,
      emp_name: item.emp_name,
      reporting_manager: item.reporting_manager,
      monthly_rate: item.monthly_rate,
      leaves_allowed: item.allowed_leaves,
      leaves_taken: item.leaves_taken,
      days_in_month: item.days_in_month,
      chargeable_days: item.chargeable_days,
      invoice_amount: item.invoice_amount,
    }));
    const { error } = await supabase.from('billing_items').insert(rows);
    if (error) throw new Error(error.message);
  },

  async addErrors(runId, errors) {
    const rows = errors.map((err) => ({
      billing_run_id: runId,
      emp_code: err.emp_code || null,
      error_message: err.error_message,
    }));
    const { error } = await supabase.from('billing_errors').insert(rows);
    if (error) throw new Error(error.message);
  },

  async findRuns(limit = 20, offset = 0) {
    const { data, error } = await supabase
      .from('billing_runs')
      .select('id, billing_month, total_employees, total_amount, error_count, output_file, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return data;
  },

  async findRunById(id) {
    const { data: run, error: runErr } = await supabase
      .from('billing_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) return null;

    const [itemsResult, errorsResult] = await Promise.all([
      supabase.from('billing_items').select('*').eq('billing_run_id', id),
      supabase.from('billing_errors').select('*').eq('billing_run_id', id),
    ]);
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    if (errorsResult.error) throw new Error(errorsResult.error.message);

    return { ...run, items: itemsResult.data, errors: errorsResult.data };
  },
};

module.exports = BillingModel;
