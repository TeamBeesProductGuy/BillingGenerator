const { supabase } = require('../config/database');

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes('column') && error.message.includes(columnName));
}

const BillingModel = {
  async createRun(data) {
    let { data: row, error } = await supabase
      .from('billing_runs')
      .insert({
        billing_month: data.billing_month,
        client_id: data.client_id || null,
        total_employees: data.total_employees,
        total_amount: data.total_amount,
        error_count: data.error_count,
        output_file: data.output_file,
        request_status: data.request_status || 'Pending',
      })
      .select('id')
      .single();

    if (isMissingColumnError(error, 'request_status')) {
      ({ data: row, error } = await supabase
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
        .single());
    }
    if (error) throw new Error(error.message);
    return row.id;
  },

  async addItems(runId, items) {
    const rows = items.map((item) => ({
      billing_run_id: runId,
      client_id: item.client_id || null,
      client_name: item.client_name,
      sow_id: item.sow_id || null,
      sow_number: item.sow_number || null,
      service_description: item.service_description || null,
      po_number: item.po_number || null,
      po_date: item.po_date || null,
      emp_code: item.emp_code,
      emp_name: item.emp_name,
      reporting_manager: item.reporting_manager,
      monthly_rate: item.monthly_rate,
      leaves_allowed: item.allowed_leaves,
      leaves_taken: item.leaves_taken,
      days_present: item.days_present,
      billing_hours: item.billing_hours,
      billing_method: item.billing_method,
      days_in_month: item.days_in_month,
      effective_days: item.effective_days,
      charging_date: item.charging_date,
      chargeable_days: item.chargeable_days,
      billing_status: item.billing_status || 'Active',
      billing_note: item.billing_note || null,
      approval_status: item.approval_status || 'Pending',
      invoice_amount: item.invoice_amount,
      po_id: item.po_id || null,
    }));
    let { error } = await supabase.from('billing_items').insert(rows);

    if (isMissingColumnError(error, 'client_id')
      || isMissingColumnError(error, 'sow_id')
      || isMissingColumnError(error, 'sow_number')
      || isMissingColumnError(error, 'service_description')
      || isMissingColumnError(error, 'po_number')
      || isMissingColumnError(error, 'po_date')
      || isMissingColumnError(error, 'effective_days')
      || isMissingColumnError(error, 'charging_date')
      || isMissingColumnError(error, 'days_present')
      || isMissingColumnError(error, 'billing_hours')
      || isMissingColumnError(error, 'billing_method')
      || isMissingColumnError(error, 'billing_status')
      || isMissingColumnError(error, 'billing_note')
      || isMissingColumnError(error, 'approval_status')
      || isMissingColumnError(error, 'po_id')) {
      const fallbackRows = items.map((item) => ({
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
      ({ error } = await supabase.from('billing_items').insert(fallbackRows));
    }

    // Backward compatibility: legacy DBs may still have billing_items.leaves_taken as INTEGER.
    // If half-day leaves produce fractional values, retry with rounded leaves_taken so billing run can still be stored.
    const hasFractionalLeaves = rows.some((row) => !Number.isInteger(Number(row.leaves_taken || 0)));
    if (error && error.message && error.message.includes('invalid input syntax for type integer') && hasFractionalLeaves) {
      const legacyRows = rows.map((row) => ({
        ...row,
        leaves_taken: Math.round(Number(row.leaves_taken || 0)),
      }));
      ({ error } = await supabase.from('billing_items').insert(legacyRows));
    }
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
    let { data, error } = await supabase
      .from('billing_runs')
      .select('id, billing_month, total_employees, total_amount, error_count, output_file, request_status, consumption_applied_at, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isMissingColumnError(error, 'request_status') || isMissingColumnError(error, 'consumption_applied_at')) {
      ({ data, error } = await supabase
        .from('billing_runs')
        .select('id, billing_month, total_employees, total_amount, error_count, output_file, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1));
      if (!error && Array.isArray(data)) {
        data = data.map((row) => ({
          ...row,
          request_status: 'Pending',
          consumption_applied_at: null,
        }));
      }
    }
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

  async updateRunStatus(id, requestStatus) {
    const payload = {
      request_status: requestStatus,
      decision_at: new Date().toISOString(),
    };
    if (requestStatus === 'Accepted') {
      payload.consumption_applied_at = new Date().toISOString();
    }
    let { error } = await supabase.from('billing_runs').update(payload).eq('id', id);

    if (isMissingColumnError(error, 'request_status')
      || isMissingColumnError(error, 'decision_at')
      || isMissingColumnError(error, 'consumption_applied_at')) {
      return;
    }
    if (error) throw new Error(error.message);
  },

  async updateRunStatusOnly(id, requestStatus) {
    let { error } = await supabase
      .from('billing_runs')
      .update({ request_status: requestStatus, decision_at: new Date().toISOString() })
      .eq('id', id);
    if (isMissingColumnError(error, 'request_status') || isMissingColumnError(error, 'decision_at')) return;
    if (error) throw new Error(error.message);
  },

  async hasConsumptionForRun(runId) {
    const { count, error } = await supabase
      .from('po_consumption_log')
      .select('*', { count: 'exact', head: true })
      .eq('billing_run_id', runId);
    if (error) throw new Error(error.message);
    return (count || 0) > 0;
  },

  async assignMissingPOs(runId, assignments) {
    for (const assignment of assignments) {
      let { error } = await supabase
        .from('billing_items')
        .update({ po_id: assignment.po_id })
        .eq('billing_run_id', runId)
        .eq('emp_code', assignment.emp_code);
      if (isMissingColumnError(error, 'po_id')) {
        return;
      }
      if (error) throw new Error(error.message);
    }
  },

  async markItemsApproved(runId, itemIds, managerName) {
    if (!itemIds || itemIds.length === 0) return;
    let { error } = await supabase
      .from('billing_items')
      .update({
        approval_status: 'Accepted',
        approved_at: new Date().toISOString(),
        approved_by_manager: managerName || null,
      })
      .eq('billing_run_id', runId)
      .in('id', itemIds);
    if (isMissingColumnError(error, 'approval_status') || isMissingColumnError(error, 'approved_at') || isMissingColumnError(error, 'approved_by_manager')) return;
    if (error) throw new Error(error.message);
  },

  async markItemsRejected(runId, itemIds) {
    if (!itemIds || itemIds.length === 0) return;
    let { error } = await supabase
      .from('billing_items')
      .update({ approval_status: 'Rejected' })
      .eq('billing_run_id', runId)
      .in('id', itemIds);
    if (isMissingColumnError(error, 'approval_status')) return;
    if (error) throw new Error(error.message);
  },

  async markItemsPoConsumed(runId, itemIds) {
    if (!itemIds || itemIds.length === 0) return;
    let { error } = await supabase
      .from('billing_items')
      .update({ po_consumed_at: new Date().toISOString() })
      .eq('billing_run_id', runId)
      .in('id', itemIds);
    if (isMissingColumnError(error, 'po_consumed_at')) return;
    if (error) throw new Error(error.message);
  },
};

module.exports = BillingModel;
