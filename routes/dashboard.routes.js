const router = require('express').Router();
const { supabase } = require('../config/database');
const catchAsync = require('../middleware/catchAsync');
const { generateDashboardTrackerWorkbook } = require('../services/dashboardTrackerExcel.service');

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

router.get('/stats', catchAsync(async (req, res) => {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw new Error(error.message);
  res.json({ success: true, data });
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
