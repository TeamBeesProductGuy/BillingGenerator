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
        rate_card_id: employee.id,
        emp_code: employee.emp_code,
        emp_name: employee.emp_name || '',
        reporting_manager: employee.reporting_manager || '',
        leaves_allowed: employee.leaves_allowed,
        client_id: employee.client_id,
        client_name: employee.client_name || '',
      },
    });
  }),

  submitSingle: catchAsync(async (req, res) => {
    const { emp_code, emp_name, reporting_manager, billing_month, day_number, status } = req.body;
    try {
      await AttendanceModel.bulkUpsert([{ emp_code, emp_name, reporting_manager, billing_month, day_number, status: status.toUpperCase() }]);
    } catch (err) {
      if (err && err.message && err.message.includes('WO attendance requires DB migration 016')) {
        throw new AppError(400, err.message);
      }
      throw err;
    }
    res.json({ success: true, data: { message: 'Attendance recorded' } });
  }),

  submitBulk: catchAsync(async (req, res) => {
    const RateCardModel = require('../models/rateCard.model');
    const { emp_code, billing_month, leaves, leave_entries } = req.body;
    const monthError = validateBillingMonth(billing_month);
    if (monthError) throw new AppError(400, monthError);

    const matches = await RateCardModel.findActiveByEmpCode(emp_code);
    if (matches.length === 0) throw new AppError(404, 'Employee code not found in active rate cards');
    if (matches.length > 1) {
      throw new AppError(409, 'Employee code is ambiguous across clients. Attendance entry rejected.');
    }
    const employee = matches[0];

    const daysInMonth = getDaysInMonth(billing_month);

    const dayLeaveUnits = {};
    if (Array.isArray(leave_entries) && leave_entries.length > 0) {
      leave_entries.forEach((entry) => {
        const dayNum = parseInt(entry.day_number, 10);
        const units = Number(entry.leave_units);
        if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > daysInMonth) return;
        if (units !== 1 && units !== 0.5) return;
        dayLeaveUnits[dayNum] = units;
      });
    } else if (Array.isArray(leaves)) {
      leaves.forEach((d) => {
        const dayNum = parseInt(d, 10);
        if (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= daysInMonth) {
          dayLeaveUnits[dayNum] = 1;
        }
      });
    } else if (typeof leaves === 'number' && leaves > 0) {
      const normalizedLeaves = Math.round(leaves * 2) / 2;
      if (normalizedLeaves > daysInMonth) {
        throw new AppError(400, `Leaves cannot exceed ${daysInMonth} days for this month`);
      }
      const fullLeaves = Math.floor(normalizedLeaves);
      const hasHalfDay = normalizedLeaves % 1 !== 0;
      for (let d = daysInMonth; d > daysInMonth - fullLeaves && d >= 1; d--) {
        dayLeaveUnits[d] = 1;
      }
      if (hasHalfDay) {
        const halfDay = daysInMonth - fullLeaves;
        if (halfDay < 1) {
          throw new AppError(400, 'Half-day leave cannot be assigned beyond month limits');
        }
        dayLeaveUnits[halfDay] = 0.5;
      }
    }

    const records = [];
    let totalLeaveUnits = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const leaveUnits = Number(dayLeaveUnits[day] || 0);
      totalLeaveUnits += leaveUnits;
      records.push({
        emp_code,
        emp_name: employee.emp_name || null,
        reporting_manager: employee.reporting_manager || null,
        billing_month,
        day_number: day,
        status: leaveUnits > 0 ? 'L' : 'P',
        leave_units: leaveUnits,
      });
    }

    try {
      await AttendanceModel.bulkUpsert(records);
    } catch (err) {
      if (err && err.message && err.message.includes('Half-day attendance requires DB migration 006')) {
        throw new AppError(400, err.message);
      }
      throw err;
    }
    res.json({
      success: true,
      data: {
        message: `Attendance recorded for ${daysInMonth} days, ${totalLeaveUnits} leaves`,
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
      const RateCardModel = require('../models/rateCard.model');
      const rateCards = await RateCardModel.findAll();
      const { records, errors } = await parseAttendance(req.file.path, billingMonth, { rateCards });
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
            leave_units: Number(
              rec.day_leave_units && rec.day_leave_units[day] !== undefined
                ? rec.day_leave_units[day]
                : ((rec.days[day] || 'P') === 'L' ? 1 : 0)
            ),
          });
        }
      }

      if (dbRecords.length > 0) {
        try {
          await AttendanceModel.bulkUpsert(dbRecords);
        } catch (err) {
          if (err && err.message && (err.message.includes('Half-day attendance requires DB migration 006') || err.message.includes('WO attendance requires DB migration 016'))) {
            throw new AppError(400, err.message);
          }
          throw err;
        }
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
