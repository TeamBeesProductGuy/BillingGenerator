const router = require('express').Router();
const { supabase } = require('../config/database');
const catchAsync = require('../middleware/catchAsync');
const { generateDashboardTrackerWorkbook } = require('../services/dashboardTrackerExcel.service');
const { isAdminUser } = require('../services/adminApproval.service');
const { AppError } = require('../middleware/errorHandler');

router.use((req, res, next) => {
  if (!isAdminUser(req.user)) throw new AppError(403, 'Dashboard is admin-only');
  next();
});

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatJoiningMonth(value) {
  const date = toDate(value);
  if (!date) return '';
  return String(date.getFullYear()).slice(-2) + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

async function buildTrackerRowsFromLiveData() {
  const [rateCardsResult, clientsResult, sowsResult, sowItemsResult, poResult] = await Promise.all([
    supabase.from('rate_cards_view').select('*').eq('is_active', true).order('emp_code'),
    supabase.from('clients').select('*').eq('is_active', true),
    supabase.from('sows_view').select('*'),
    supabase.from('sow_items').select('*'),
    supabase.from('purchase_orders_view').select('*'),
  ]);

  if (rateCardsResult.error) throw new Error(rateCardsResult.error.message);
  if (clientsResult.error) throw new Error(clientsResult.error.message);
  if (sowsResult.error) throw new Error(sowsResult.error.message);
  if (sowItemsResult.error) throw new Error(sowItemsResult.error.message);
  if (poResult.error) throw new Error(poResult.error.message);

  const clientsById = new Map((clientsResult.data || []).map((row) => [row.id, row]));
  const sowsById = new Map((sowsResult.data || []).map((row) => [row.id, row]));
  const poById = new Map((poResult.data || []).map((row) => [row.id, row]));
  const sowItemsBySowId = new Map();

  (sowItemsResult.data || []).forEach((item) => {
    const list = sowItemsBySowId.get(item.sow_id) || [];
    list.push(item);
    sowItemsBySowId.set(item.sow_id, list);
  });

  return (rateCardsResult.data || []).map((row, index) => {
    const client = clientsById.get(row.client_id) || {};
    const sow = row.sow_id ? (sowsById.get(row.sow_id) || {}) : {};
    const po = row.po_id ? (poById.get(row.po_id) || {}) : {};
    const sowItems = row.sow_id ? (sowItemsBySowId.get(row.sow_id) || []) : [];
    const linkedSowItem = row.sow_item_id ? sowItems.find((item) => item.id === row.sow_item_id) : null;
    const resourceDescription = linkedSowItem
      ? linkedSowItem.role_position
      : (sowItems.length === 1 ? sowItems[0].role_position : (row.role_position || ''));
    const poEndDate = toDate(po.end_date);
    const doj = toDate(row.doj);

    return {
      sno: index + 1,
      sow_number: sow.sow_number || row.sow_number || '',
      customer_name: client.client_name || row.client_name || '',
      location: client.location || client.address || '',
      sow_effective_date: sow.effective_start || '',
      sow_end_date: sow.effective_end || '',
      resource_description: resourceDescription,
      resource_name: row.emp_name || '',
      emp_code: row.emp_code || '',
      doj_teambees: row.doj || '',
      doj_client: row.charging_date || '',
      gender: row.gender || '',
      resource_status: row.resource_status || '',
      reporting_manager: row.reporting_manager || '',
      monthly_rate: row.monthly_rate || 0,
      po_number: po.po_number || row.po_number || '',
      po_date: po.po_date || '',
      po_start_date: po.start_date || '',
      po_end_date: po.end_date || '',
      po_value: po.po_value || 0,
      po_days_left: poEndDate ? Math.ceil((poEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : '',
      remark_1: row.remark_1 || '',
      remark_2: row.remark_2 || '',
      joining_month: formatJoiningMonth(doj),
      joining_calendar_year: doj ? doj.getFullYear() : '',
    };
  });
}

function yyyymm(date) {
  return String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2, '0');
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function expect(result, label) {
  if (result && result.error) throw new Error(label + ': ' + result.error.message);
  return result ? result.data : null;
}

router.get('/stats', catchAsync(async (req, res) => {
  const horizonDays = 15;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + horizonDays);
  const todayKey = isoDateOnly(today);
  const horizonKey = isoDateOnly(horizon);
  const currentYM = yyyymm(today);
  const twelveAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const twelveAgoYM = yyyymm(twelveAgo);

  const [
    clientsCountR, employeesCountR, sowsCountR, posCountR, quotesCountR,
    activePosR, expiringPosR, expiringSowsR, runsAllR, clientsListR,
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('rate_cards').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('sows').select('id', { count: 'exact', head: true }).in('status', ['Signed', 'Active']),
    supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'Draft'),
    supabase.from('purchase_orders').select('id, po_number, po_value, consumed_value, alert_threshold, end_date, client_id, sow_id').eq('status', 'Active'),
    supabase.from('purchase_orders').select('id, po_number, end_date, po_value, consumed_value, client_id, sow_id').eq('status', 'Active').gte('end_date', todayKey).lte('end_date', horizonKey),
    supabase.from('sows').select('id, sow_number, effective_end, client_id, total_value').in('status', ['Signed', 'Active']).gte('effective_end', todayKey).lte('effective_end', horizonKey),
    supabase.from('billing_runs').select('id, billing_month, total_amount, total_employees, error_count, created_at, client_id').order('created_at', { ascending: false }),
    supabase.from('clients').select('id, client_name, abbreviation'),
  ]);

  if (clientsCountR.error) throw new Error('clients count: ' + clientsCountR.error.message);
  if (employeesCountR.error) throw new Error('employees count: ' + employeesCountR.error.message);
  if (sowsCountR.error) throw new Error('sows count: ' + sowsCountR.error.message);
  if (posCountR.error) throw new Error('pos count: ' + posCountR.error.message);
  if (quotesCountR.error) throw new Error('quotes count: ' + quotesCountR.error.message);
  const activePos = expect(activePosR, 'active POs') || [];
  const expiringPosRaw = expect(expiringPosR, 'expiring POs') || [];
  const expiringSowsRaw = expect(expiringSowsR, 'expiring SOWs') || [];
  const allRuns = expect(runsAllR, 'billing runs') || [];
  const clientsList = expect(clientsListR, 'clients list') || [];

  const clientMap = {};
  clientsList.forEach((c) => { clientMap[c.id] = c; });
  const clientNameFor = (id) => (id && clientMap[id]) ? (clientMap[id].abbreviation || clientMap[id].client_name) : 'Multi-client';

  // PO rollup
  const poCommitted = activePos.reduce((s, p) => s + Number(p.po_value || 0), 0);
  const poConsumed = activePos.reduce((s, p) => s + Number(p.consumed_value || 0), 0);
  const poRemaining = Math.max(0, poCommitted - poConsumed);
  const poConsumedPct = poCommitted > 0 ? (poConsumed / poCommitted) * 100 : 0;

  // High consumption POs
  const highConsumptionPos = activePos
    .map((p) => {
      const pct = Number(p.po_value || 0) > 0 ? (Number(p.consumed_value || 0) / Number(p.po_value)) * 100 : 0;
      return {
        id: p.id,
        po_number: p.po_number,
        client_id: p.client_id,
        client_name: clientNameFor(p.client_id),
        po_value: Number(p.po_value || 0),
        consumed_value: Number(p.consumed_value || 0),
        remaining_value: Math.max(0, Number(p.po_value || 0) - Number(p.consumed_value || 0)),
        end_date: p.end_date,
        consumption_pct: pct,
        alert_threshold: Number(p.alert_threshold || 80),
      };
    })
    .filter((p) => p.consumption_pct >= p.alert_threshold)
    .sort((a, b) => b.consumption_pct - a.consumption_pct);

  // Expiring lists with days_left
  const expiringPos = expiringPosRaw
    .map((p) => {
      const end = toDate(p.end_date);
      const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000)) : null;
      return {
        id: p.id,
        po_number: p.po_number,
        client_id: p.client_id,
        client_name: clientNameFor(p.client_id),
        end_date: p.end_date,
        days_left: daysLeft,
        po_value: Number(p.po_value || 0),
        consumed_value: Number(p.consumed_value || 0),
        remaining_value: Math.max(0, Number(p.po_value || 0) - Number(p.consumed_value || 0)),
      };
    })
    .sort((a, b) => (a.days_left || 0) - (b.days_left || 0));

  const expiringSows = expiringSowsRaw
    .map((s) => {
      const end = toDate(s.effective_end);
      const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000)) : null;
      return {
        id: s.id,
        sow_number: s.sow_number,
        client_id: s.client_id,
        client_name: clientNameFor(s.client_id),
        effective_end: s.effective_end,
        days_left: daysLeft,
        total_value: Number(s.total_value || 0),
      };
    })
    .sort((a, b) => (a.days_left || 0) - (b.days_left || 0));

  const poAlertsCount = highConsumptionPos.length + expiringPos.length;

  // Revenue calculations
  const revenueMTD = allRuns
    .filter((r) => String(r.billing_month) === currentYM)
    .reduce((s, r) => s + Number(r.total_amount || 0), 0);

  const last12Runs = allRuns.filter((r) => String(r.billing_month) >= twelveAgoYM);
  const revenueLast12M = last12Runs.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const revenueAllTime = allRuns.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  // Revenue trend - 12 months
  const trendMap = {};
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    trendMap[yyyymm(d)] = 0;
  }
  last12Runs.forEach((r) => {
    if (trendMap[r.billing_month] !== undefined) {
      trendMap[r.billing_month] += Number(r.total_amount || 0);
    }
  });
  const revenueTrend = Object.entries(trendMap).map(([k, v]) => ({ billing_month: k, total: v }));

  // Top clients by revenue (last 12M) - distribute multi-client runs via items
  const clientRevMap = {};
  const multiClientRunIds = [];
  last12Runs.forEach((r) => {
    if (r.client_id) {
      const cid = r.client_id;
      clientRevMap[cid] = (clientRevMap[cid] || 0) + Number(r.total_amount || 0);
    } else {
      multiClientRunIds.push(r.id);
    }
  });

  if (multiClientRunIds.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from('billing_items')
      .select('billing_run_id, client_id, invoice_amount')
      .in('billing_run_id', multiClientRunIds);
    if (itemsErr) throw new Error('billing items: ' + itemsErr.message);
    (items || []).forEach((it) => {
      if (!it.client_id) return;
      clientRevMap[it.client_id] = (clientRevMap[it.client_id] || 0) + Number(it.invoice_amount || 0);
    });
  }

  const topClients = Object.entries(clientRevMap)
    .map(([cid, total]) => ({
      client_id: Number(cid),
      client_name: clientNameFor(Number(cid)),
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const recentRuns = allRuns.slice(0, 5).map((r) => ({
    ...r,
    client_name: clientNameFor(r.client_id),
  }));

  res.json({
    success: true,
    data: {
      counts: {
        clients: clientsCountR.count || 0,
        employees: employeesCountR.count || 0,
        activeSOWs: sowsCountR.count || 0,
        activePOs: posCountR.count || 0,
        pendingQuotes: quotesCountR.count || 0,
        billingRuns: allRuns.length,
        poAlerts: poAlertsCount,
      },
      financials: {
        poCommitted,
        poConsumed,
        poRemaining,
        poConsumedPct,
        revenueMTD,
        revenueLast12M,
        revenueAllTime,
      },
      expiringPos,
      expiringSows,
      highConsumptionPos,
      topClients,
      recentRuns,
      revenueTrend,
      meta: {
        horizonDays,
        horizonDate: horizonKey,
        currentMonth: currentYM,
        twelveMonthsAgo: twelveAgoYM,
      },
    },
  });
}));

router.get('/tracker/export', catchAsync(async (req, res) => {
  let data = [];

  try {
    const refreshResult = await supabase.rpc('refresh_dashboard_order_tracker');
    if (refreshResult.error) throw new Error(refreshResult.error.message);

    const trackerResult = await supabase
      .from('dashboard_order_tracker')
      .select('*')
      .order('sno', { ascending: true });

    if (trackerResult.error) throw new Error(trackerResult.error.message);
    data = trackerResult.data || [];
  } catch (trackerError) {
    data = await buildTrackerRowsFromLiveData();
  }

  const workbook = await generateDashboardTrackerWorkbook(data || []);
  const filename = 'Order_Tracker.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  await workbook.xlsx.write(res);
  res.end();
}));

module.exports = router;
