const { supabase } = require('../config/database');

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes('column') && error.message.includes(columnName));
}

function throwSowMigrationError() {
  throw new Error('Rate card SOW linkage requires DB migration: run database/migrations/003_service_request_workflow.sql in Supabase SQL Editor (adds rate_cards.sow_id and updates rate_cards_view).');
}

function throwRateCardFieldMigrationError() {
  throw new Error('Rate card fields require DB migration: run database/migrations/014_rate_card_service_billing_flags.sql in Supabase SQL Editor.');
}

function throwRateCardBillingWindowMigrationError() {
  throw new Error('Rate card pause/disable billing fields require DB migration: run database/migrations/017_client_leaves_and_rate_card_billing_windows.sql in Supabase SQL Editor.');
}

function throwRateCardSowItemMigrationError() {
  throw new Error('Rate card SOW item linkage requires DB migration: run database/migrations/018_rate_card_sow_item_link.sql in Supabase SQL Editor.');
}

const RateCardModel = {
  async findAll(clientId) {
    let query = supabase
      .from('rate_cards_view')
      .select('*')
      .eq('is_active', true);
    if (Array.isArray(clientId) && clientId.length > 0) {
      query = query.in('client_id', clientId);
    } else if (clientId) {
      query = query.eq('client_id', clientId);
    }
    query = query.order('client_name').order('emp_code');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('rate_cards_view')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async findByEmpCode(empCode, clientId) {
    const { data, error } = await supabase
      .from('rate_cards_view')
      .select('*')
      .eq('emp_code', empCode)
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async findActiveByEmpCode(empCode) {
    const { data, error } = await supabase
      .from('rate_cards_view')
      .select('id, client_id, client_name, emp_code, emp_name, reporting_manager, leaves_allowed')
      .eq('emp_code', empCode)
      .eq('is_active', true)
      .order('client_name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(data) {
    let { data: row, error } = await supabase
      .from('rate_cards')
      .insert({
        client_id: data.client_id,
        emp_code: data.emp_code,
        emp_name: data.emp_name,
        doj: data.doj || null,
        reporting_manager: data.reporting_manager || null,
        service_description: data.service_description || null,
        sow_item_id: data.sow_item_id || null,
        monthly_rate: data.monthly_rate,
        leaves_allowed: data.leaves_allowed || 0,
        charging_date: data.charging_date || null,
        sow_id: data.sow_id,
        po_id: data.po_id || null,
        billing_active: data.billing_active !== false,
        no_invoice: Boolean(data.no_invoice),
        pause_billing: Boolean(data.pause_billing),
        pause_start_date: data.pause_billing !== undefined ? (data.pause_billing ? (data.pause_start_date || null) : null) : undefined,
        pause_end_date: data.pause_billing !== undefined ? (data.pause_billing ? (data.pause_end_date || null) : null) : undefined,
        disable_billing: Boolean(data.disable_billing),
        disable_from_date: data.disable_billing !== undefined ? (data.disable_billing ? (data.disable_from_date || null) : null) : undefined,
      })
      .select('id')
      .single();

    if (isMissingColumnError(error, 'sow_id')) {
      throwSowMigrationError();
    }
    if (isMissingColumnError(error, 'service_description') || isMissingColumnError(error, 'billing_active') || isMissingColumnError(error, 'no_invoice')) {
      throwRateCardFieldMigrationError();
    }
    if (isMissingColumnError(error, 'pause_billing') || isMissingColumnError(error, 'disable_billing')) {
      throwRateCardBillingWindowMigrationError();
    }
    if (isMissingColumnError(error, 'sow_item_id')) {
      throwRateCardSowItemMigrationError();
    }
    if (error) throw new Error(error.message);
    return row.id;
  },

  async bulkCreate(records) {
    const rows = records.map((data) => ({
      client_id: data.client_id,
      emp_code: data.emp_code,
      emp_name: data.emp_name,
      doj: data.doj || null,
      reporting_manager: data.reporting_manager || null,
      service_description: data.service_description || null,
      sow_item_id: data.sow_item_id || null,
      monthly_rate: data.monthly_rate,
      leaves_allowed: data.leaves_allowed || 0,
      charging_date: data.charging_date || null,
      sow_id: data.sow_id,
      po_id: data.po_id || null,
      billing_active: data.billing_active !== false,
      no_invoice: Boolean(data.no_invoice),
      pause_billing: Boolean(data.pause_billing),
      pause_start_date: data.pause_billing ? (data.pause_start_date || null) : null,
      pause_end_date: data.pause_billing ? (data.pause_end_date || null) : null,
      disable_billing: Boolean(data.disable_billing),
      disable_from_date: data.disable_billing ? (data.disable_from_date || null) : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));
    let result = await supabase
      .from('rate_cards')
      .upsert(rows, { onConflict: 'client_id,emp_code' })
      .select('id');

    if (isMissingColumnError(result.error, 'sow_id')) {
      throwSowMigrationError();
    }
    if (isMissingColumnError(result.error, 'service_description') || isMissingColumnError(result.error, 'billing_active') || isMissingColumnError(result.error, 'no_invoice')) {
      throwRateCardFieldMigrationError();
    }
    if (isMissingColumnError(result.error, 'pause_billing') || isMissingColumnError(result.error, 'disable_billing')) {
      throwRateCardBillingWindowMigrationError();
    }
    if (isMissingColumnError(result.error, 'sow_item_id')) {
      throwRateCardSowItemMigrationError();
    }

    if (result.error) throw new Error(result.error.message);
    return result.data.map((r) => r.id);
  },

  async update(id, data) {
    let { error } = await supabase
      .from('rate_cards')
      .update({
        emp_code: data.emp_code,
        emp_name: data.emp_name,
        doj: data.doj || null,
        reporting_manager: data.reporting_manager || null,
        service_description: data.service_description || null,
        sow_item_id: data.sow_item_id !== undefined ? (data.sow_item_id || null) : undefined,
        monthly_rate: data.monthly_rate,
        leaves_allowed: data.leaves_allowed || 0,
        charging_date: data.charging_date || null,
        sow_id: data.sow_id,
        po_id: data.po_id !== undefined ? (data.po_id || null) : undefined,
        billing_active: data.billing_active !== undefined ? data.billing_active !== false : undefined,
        no_invoice: data.no_invoice !== undefined ? Boolean(data.no_invoice) : undefined,
        pause_billing: data.pause_billing !== undefined ? Boolean(data.pause_billing) : undefined,
        pause_start_date: data.pause_billing !== undefined ? (data.pause_billing ? (data.pause_start_date || null) : null) : undefined,
        pause_end_date: data.pause_billing !== undefined ? (data.pause_billing ? (data.pause_end_date || null) : null) : undefined,
        disable_billing: data.disable_billing !== undefined ? Boolean(data.disable_billing) : undefined,
        disable_from_date: data.disable_billing !== undefined ? (data.disable_billing ? (data.disable_from_date || null) : null) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (isMissingColumnError(error, 'sow_id')) {
      throwSowMigrationError();
    }
    if (isMissingColumnError(error, 'service_description') || isMissingColumnError(error, 'billing_active') || isMissingColumnError(error, 'no_invoice')) {
      throwRateCardFieldMigrationError();
    }
    if (isMissingColumnError(error, 'pause_billing') || isMissingColumnError(error, 'disable_billing')) {
      throwRateCardBillingWindowMigrationError();
    }
    if (isMissingColumnError(error, 'sow_item_id')) {
      throwRateCardSowItemMigrationError();
    }
    if (error) throw new Error(error.message);
  },

  async updateLeavesAllowed(id, leavesAllowed) {
    const { error } = await supabase
      .from('rate_cards')
      .update({ leaves_allowed: leavesAllowed, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async findByPoId(poId) {
    const { data, error } = await supabase
      .from('rate_cards_view')
      .select('*')
      .eq('po_id', poId)
      .eq('is_active', true)
      .order('emp_code');
    if (error) throw new Error(error.message);
    return data;
  },

  async softDelete(id) {
    const { error } = await supabase
      .from('rate_cards')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = RateCardModel;
