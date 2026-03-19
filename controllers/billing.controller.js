const path = require('path');
const fs = require('fs');
const { parseRateCard, parseAttendance } = require('../services/excelParser.service');
const { validateBillingMonth, crossValidate } = require('../services/validation.service');
const { calculateBilling } = require('../services/billing.service');
const { generateBillingExcel } = require('../services/excelWriter.service');
const BillingModel = require('../models/billing.model');
const RateCardModel = require('../models/rateCard.model');
const AttendanceModel = require('../models/attendance.model');
const POModel = require('../models/purchaseOrder.model');
const { supabase } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

/**
 * Resolve po_number strings (from Excel upload) to po_id integers
 * by looking up active POs in the database.
 */
async function resolvePoNumbers(records) {
  const poNumbers = [...new Set(records.filter((r) => r.po_number && !r.po_id).map((r) => r.po_number))];
  if (poNumbers.length === 0) return;

  const { data: pos, error } = await supabase
    .from('purchase_orders')
    .select('id, po_number')
    .in('po_number', poNumbers)
    .eq('status', 'Active');
  if (error || !pos) return;

  const poMap = {};
  for (const po of pos) {
    poMap[po.po_number] = po.id;
  }
  for (const rc of records) {
    if (rc.po_number && !rc.po_id && poMap[rc.po_number]) {
      rc.po_id = poMap[rc.po_number];
    }
  }
}

/**
 * Auto-consume PO value for billing items that have a po_id.
 * Groups amounts by PO and records each consumption.
 */
async function autoConsumePOs(billingItems, billingMonth, runId) {
  const consumptionByPo = {};
  for (const item of billingItems) {
    if (item.po_id) {
      if (!consumptionByPo[item.po_id]) consumptionByPo[item.po_id] = 0;
      consumptionByPo[item.po_id] += item.invoice_amount;
    }
  }

  const poConsumption = [];
  for (const [poId, totalAmount] of Object.entries(consumptionByPo)) {
    try {
      await POModel.addConsumption(parseInt(poId, 10), totalAmount, `Billing ${billingMonth} run #${runId}`, runId);
      poConsumption.push({ po_id: parseInt(poId, 10), amount: totalAmount, status: 'ok' });
    } catch (err) {
      poConsumption.push({ po_id: parseInt(poId, 10), amount: totalAmount, status: 'error', message: err.message });
    }
  }
  return poConsumption;
}

const billingController = {
  generateFromFiles: catchAsync(async (req, res) => {
    const billingMonth = req.body.billingMonth;
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);

    if (!req.files || !req.files.rateCardFile || !req.files.attendanceFile) {
      throw new AppError(400, 'Both Rate Card and Attendance Excel files are required');
    }

    const rateCardPath = req.files.rateCardFile[0].path;
    const attendancePath = req.files.attendanceFile[0].path;

    try {
      const rateCardResult = await parseRateCard(rateCardPath);
      const attendanceResult = await parseAttendance(attendancePath, billingMonth);

      // Resolve po_number strings from Excel to po_id integers from DB
      await resolvePoNumbers(rateCardResult.records);

      const allErrors = [...rateCardResult.errors, ...attendanceResult.errors];

      // Warn about rate cards without PO linkage
      for (const rc of rateCardResult.records) {
        if (!rc.po_id) {
          allErrors.push({ emp_code: rc.emp_code, error_message: `WARNING: ${rc.emp_code} (${rc.emp_name}) has no PO assignment. Billing will not consume from any PO.` });
        }
      }

      if (rateCardResult.records.length > 0 && attendanceResult.records.length > 0) {
        const crossErrors = crossValidate(rateCardResult.records, attendanceResult.records);
        allErrors.push(...crossErrors);
      }

      const result = calculateBilling(rateCardResult.records, attendanceResult.records, billingMonth);
      allErrors.push(...result.errors);

      const { filePath, filename } = await generateBillingExcel(result.billingItems, allErrors, billingMonth);

      const runId = await BillingModel.createRun({
        billing_month: billingMonth,
        total_employees: result.summary.totalEmployees,
        total_amount: result.summary.totalAmount,
        error_count: allErrors.length,
        output_file: filePath,
      });

      if (result.billingItems.length > 0) await BillingModel.addItems(runId, result.billingItems);
      if (allErrors.length > 0) await BillingModel.addErrors(runId, allErrors);

      // Auto-consume from POs linked via rate cards
      const poConsumption = await autoConsumePOs(result.billingItems, billingMonth, runId);

      res.json({
        success: true,
        data: {
          billingRunId: runId,
          summary: result.summary,
          errors: allErrors,
          billingItems: result.billingItems,
          downloadUrl: `/api/billing/runs/${runId}/download`,
          filename,
          poConsumption,
        },
      });
    } finally {
      try { fs.unlinkSync(rateCardPath); } catch (e) { /* ignore */ }
      try { fs.unlinkSync(attendancePath); } catch (e) { /* ignore */ }
    }
  }),

  generateFromDb: catchAsync(async (req, res) => {
    const { clientId, billingMonth } = req.body;
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);

    const rateCards = await RateCardModel.findAll(clientId || null);

    if (rateCards.length === 0) {
      throw new AppError(400, 'No active rate cards found');
    }

    const attendanceSummary = await AttendanceModel.getSummary(billingMonth);

    const attendanceRecords = attendanceSummary.map((a) => ({
      emp_code: a.emp_code,
      emp_name: a.emp_name,
      reporting_manager: a.reporting_manager,
      leaves_taken: Number(a.leaves_taken),
      days: {},
    }));

    const allErrors = [];

    // Warn about rate cards without PO linkage
    for (const rc of rateCards) {
      if (!rc.po_id) {
        allErrors.push({ emp_code: rc.emp_code, error_message: `WARNING: ${rc.emp_code} (${rc.emp_name}) has no PO assignment. Billing will not consume from any PO.` });
      }
    }

    const crossErrors = crossValidate(rateCards, attendanceRecords);
    allErrors.push(...crossErrors);

    const result = calculateBilling(rateCards, attendanceRecords, billingMonth);
    allErrors.push(...result.errors);

    const { filePath, filename } = await generateBillingExcel(result.billingItems, allErrors, billingMonth);

    const runId = await BillingModel.createRun({
      billing_month: billingMonth,
      client_id: clientId || null,
      total_employees: result.summary.totalEmployees,
      total_amount: result.summary.totalAmount,
      error_count: allErrors.length,
      output_file: filePath,
    });

    if (result.billingItems.length > 0) await BillingModel.addItems(runId, result.billingItems);
    if (allErrors.length > 0) await BillingModel.addErrors(runId, allErrors);

    // Auto-consume from POs linked via rate cards
    const poConsumption = await autoConsumePOs(result.billingItems, billingMonth, runId);

    res.json({
      success: true,
      data: {
        billingRunId: runId,
        summary: result.summary,
        errors: allErrors,
        billingItems: result.billingItems,
        downloadUrl: `/api/billing/runs/${runId}/download`,
        filename,
        poConsumption,
      },
    });
  }),

  listRuns: catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const runs = await BillingModel.findRuns(limit, offset);
    res.json({ success: true, data: runs });
  }),

  getRunDetails: catchAsync(async (req, res) => {
    const run = await BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    res.json({ success: true, data: run });
  }),

  downloadFile: catchAsync(async (req, res) => {
    const run = await BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    if (!run.output_file || !fs.existsSync(run.output_file)) {
      throw new AppError(404, 'Output file not found');
    }
    const filename = path.basename(run.output_file);
    res.download(run.output_file, filename);
  }),
};

module.exports = billingController;
