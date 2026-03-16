const path = require('path');
const fs = require('fs');
const { parseRateCard, parseAttendance } = require('../services/excelParser.service');
const { validateBillingMonth, crossValidate } = require('../services/validation.service');
const { calculateBilling } = require('../services/billing.service');
const { generateBillingExcel } = require('../services/excelWriter.service');
const BillingModel = require('../models/billing.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

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

      const allErrors = [...rateCardResult.errors, ...attendanceResult.errors];

      if (rateCardResult.records.length > 0 && attendanceResult.records.length > 0) {
        const crossErrors = crossValidate(rateCardResult.records, attendanceResult.records);
        allErrors.push(...crossErrors);
      }

      const result = calculateBilling(rateCardResult.records, attendanceResult.records, billingMonth);
      allErrors.push(...result.errors);

      const { filePath, filename } = await generateBillingExcel(result.billingItems, allErrors, billingMonth);

      const runId = BillingModel.createRun({
        billing_month: billingMonth,
        total_employees: result.summary.totalEmployees,
        total_amount: result.summary.totalAmount,
        gst_percent: result.summary.gstPercent,
        gst_amount: result.summary.totalGst,
        total_with_gst: result.summary.grandTotal,
        error_count: allErrors.length,
        output_file: filePath,
      });

      if (result.billingItems.length > 0) BillingModel.addItems(runId, result.billingItems);
      if (allErrors.length > 0) BillingModel.addErrors(runId, allErrors);

      res.json({
        success: true,
        data: {
          billingRunId: runId,
          summary: result.summary,
          errors: allErrors,
          billingItems: result.billingItems,
          downloadUrl: `/api/billing/runs/${runId}/download`,
          filename,
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

    const db = require('../config/database');

    let rateCards;
    if (clientId) {
      rateCards = db.all(
        `SELECT rc.*, c.client_name FROM rate_cards rc
         JOIN clients c ON rc.client_id = c.id
         WHERE rc.client_id = ? AND rc.is_active = 1`,
        [clientId]
      );
    } else {
      rateCards = db.all(
        `SELECT rc.*, c.client_name FROM rate_cards rc
         JOIN clients c ON rc.client_id = c.id
         WHERE rc.is_active = 1`
      );
    }

    if (rateCards.length === 0) {
      throw new AppError(400, 'No active rate cards found');
    }

    const attendanceSummary = db.all(
      `SELECT emp_code, emp_name, reporting_manager,
       SUM(CASE WHEN status = 'L' THEN 1 ELSE 0 END) as leaves_taken
       FROM attendance WHERE billing_month = ?
       GROUP BY emp_code`,
      [billingMonth]
    );

    const attendanceRecords = attendanceSummary.map((a) => ({
      emp_code: a.emp_code,
      emp_name: a.emp_name,
      reporting_manager: a.reporting_manager,
      leaves_taken: a.leaves_taken,
      days: {},
    }));

    const allErrors = [];
    const crossErrors = crossValidate(rateCards, attendanceRecords);
    allErrors.push(...crossErrors);

    const result = calculateBilling(rateCards, attendanceRecords, billingMonth);
    allErrors.push(...result.errors);

    const { filePath, filename } = await generateBillingExcel(result.billingItems, allErrors, billingMonth);

    const runId = BillingModel.createRun({
      billing_month: billingMonth,
      client_id: clientId || null,
      total_employees: result.summary.totalEmployees,
      total_amount: result.summary.totalAmount,
      gst_percent: result.summary.gstPercent,
      gst_amount: result.summary.totalGst,
      total_with_gst: result.summary.grandTotal,
      error_count: allErrors.length,
      output_file: filePath,
    });

    if (result.billingItems.length > 0) BillingModel.addItems(runId, result.billingItems);
    if (allErrors.length > 0) BillingModel.addErrors(runId, allErrors);

    res.json({
      success: true,
      data: {
        billingRunId: runId,
        summary: result.summary,
        errors: allErrors,
        billingItems: result.billingItems,
        downloadUrl: `/api/billing/runs/${runId}/download`,
        filename,
      },
    });
  }),

  listRuns: catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;
    const runs = BillingModel.findRuns(limit, offset);
    res.json({ success: true, data: runs });
  }),

  getRunDetails: catchAsync(async (req, res) => {
    const run = BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    res.json({ success: true, data: run });
  }),

  downloadFile: catchAsync(async (req, res) => {
    const run = BillingModel.findRunById(parseInt(req.params.id, 10));
    if (!run) throw new AppError(404, 'Billing run not found');
    if (!run.output_file || !fs.existsSync(run.output_file)) {
      throw new AppError(404, 'Output file not found');
    }
    const filename = path.basename(run.output_file);
    res.download(run.output_file, filename);
  }),
};

module.exports = billingController;
