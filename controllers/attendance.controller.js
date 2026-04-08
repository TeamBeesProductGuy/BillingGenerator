const fs = require('fs');
const AttendanceModel = require('../models/attendance.model');
const { parseAttendance, getDaysInMonth } = require('../services/excelParser.service');
const { validateBillingMonth } = require('../services/validation.service');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const attendanceController = {
  list: catchAsync(async (req, res) => {
    const { empCode, billingMonth } = req.query;
    if (!empCode || !billingMonth) throw new AppError(400, 'empCode and billingMonth are required');
    const records = await AttendanceModel.findByMonth(empCode, billingMonth);
    res.json({ success: true, data: records });
  }),

  getSummary: catchAsync(async (req, res) => {
    const { billingMonth } = req.query;
    if (!billingMonth) throw new AppError(400, 'billingMonth is required');
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);
    const summary = await AttendanceModel.getSummary(billingMonth);
    res.json({ success: true, data: summary });
  }),

  lookupEmployee: catchAsync(async (req, res) => {
    const RateCardModel = require('../models/rateCard.model');
    const empCode = String(req.params.empCode || '').trim();
    if (!empCode) throw new AppError(400, 'empCode is required');

    const matches = await RateCardModel.findActiveByEmpCode(empCode);
    if (matches.length === 0) throw new AppError(404, 'Employee code not found in active rate cards');
    if (matches.length > 1) {
      throw new AppError(409, 'Employee code is ambiguous across clients. Please fix the rate cards before entering attendance.');
    }

    const employee = matches[0];
    res.json({
      success: true,
      data: {
        emp_code: employee.emp_code,
        emp_name: employee.emp_name || '',
        reporting_manager: employee.reporting_manager || '',
        client_id: employee.client_id,
        client_name: employee.client_name || '',
      },
    });
  }),

  submitSingle: catchAsync(async (req, res) => {
    const { emp_code, emp_name, reporting_manager, billing_month, day_number, status } = req.body;
    await AttendanceModel.bulkUpsert([{ emp_code, emp_name, reporting_manager, billing_month, day_number, status: status.toUpperCase() }]);
    res.json({ success: true, data: { message: 'Attendance recorded' } });
  }),

  submitBulk: catchAsync(async (req, res) => {
    const RateCardModel = require('../models/rateCard.model');
    const { emp_code, billing_month, leaves } = req.body;
    const monthError = validateBillingMonth(billing_month);
    if (monthError) throw new AppError(400, monthError);

    const matches = await RateCardModel.findActiveByEmpCode(emp_code);
    if (matches.length === 0) throw new AppError(404, 'Employee code not found in active rate cards');
    if (matches.length > 1) {
      throw new AppError(409, 'Employee code is ambiguous across clients. Attendance entry rejected.');
    }
    const employee = matches[0];

    const daysInMonth = getDaysInMonth(billing_month);

    const leaveDays = new Set();
    if (Array.isArray(leaves)) {
      leaves.forEach((d) => leaveDays.add(d));
    } else if (typeof leaves === 'number' && leaves > 0) {
      for (let d = daysInMonth; d > daysInMonth - leaves && d >= 1; d--) {
        leaveDays.add(d);
      }
    }

    const records = [];
    for (let day = 1; day <= daysInMonth; day++) {
      records.push({
        emp_code,
        emp_name: employee.emp_name || null,
        reporting_manager: employee.reporting_manager || null,
        billing_month,
        day_number: day,
        status: leaveDays.has(day) ? 'L' : 'P',
      });
    }

    await AttendanceModel.bulkUpsert(records);
    res.json({
      success: true,
      data: {
        message: `Attendance recorded for ${daysInMonth} days, ${leaveDays.size} leaves`,
        client_name: employee.client_name || '',
      },
    });
  }),

  uploadExcel: catchAsync(async (req, res) => {
    if (!req.file) throw new AppError(400, 'Excel file is required');
    const billingMonth = req.body.billingMonth;
    const monthError = validateBillingMonth(billingMonth);
    if (monthError) throw new AppError(400, monthError);

    try {
      const { records, errors } = await parseAttendance(req.file.path, billingMonth);
      const daysInMonth = getDaysInMonth(billingMonth);

      const dbRecords = [];
      for (const rec of records) {
        for (let day = 1; day <= daysInMonth; day++) {
          dbRecords.push({
            emp_code: rec.emp_code,
            emp_name: rec.emp_name,
            reporting_manager: rec.reporting_manager,
            billing_month: billingMonth,
            day_number: day,
            status: rec.days[day] || 'P',
          });
        }
      }

      if (dbRecords.length > 0) {
        await AttendanceModel.bulkUpsert(dbRecords);
      }

      res.json({
        success: true,
        data: {
          imported: records.length,
          errors: errors.length,
          errorDetails: errors,
        },
      });
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }),

  remove: catchAsync(async (req, res) => {
    const { empCode, billingMonth } = req.body;
    if (!empCode || !billingMonth) throw new AppError(400, 'empCode and billingMonth are required');
    await AttendanceModel.deleteByEmpMonth(empCode, billingMonth);
    res.json({ success: true, data: { message: 'Attendance deleted' } });
  }),

  deleteByMonth: catchAsync(async (req, res) => {
    const { billingMonth } = req.body;
    if (!billingMonth) throw new AppError(400, 'billingMonth is required');
    await AttendanceModel.deleteByMonth(billingMonth);
    res.json({ success: true, data: { message: `All attendance for ${billingMonth} deleted` } });
  }),
};

module.exports = attendanceController;
