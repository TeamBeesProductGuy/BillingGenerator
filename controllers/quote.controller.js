const ExcelJS = require('exceljs');
const QuoteModel = require('../models/quote.model');
const POModel = require('../models/purchaseOrder.model');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const quoteController = {
  list: catchAsync(async (req, res) => {
    const { clientId, status } = req.query;
    const quotes = await QuoteModel.findAll(clientId ? parseInt(clientId, 10) : null, status);
    res.json({ success: true, data: quotes });
  }),

  getById: catchAsync(async (req, res) => {
    const quote = await QuoteModel.findById(parseInt(req.params.id, 10));
    if (!quote) throw new AppError(404, 'Quote not found');
    res.json({ success: true, data: quote });
  }),

  create: catchAsync(async (req, res) => {
    const { client_id, quote_date, valid_until, tax_percent, notes, items } = req.body;
    const result = await QuoteModel.create({ client_id, quote_date, valid_until, tax_percent, notes }, items);
    res.status(201).json({ success: true, data: result });
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await QuoteModel.findById(id);
    if (!existing) throw new AppError(404, 'Quote not found');
    if (existing.status !== 'Draft') throw new AppError(400, 'Only draft quotes can be edited');
    const { client_id, quote_date, valid_until, tax_percent, notes, items } = req.body;
    await QuoteModel.update(id, { client_id, quote_date, valid_until, tax_percent, notes }, items || []);
    res.json({ success: true, data: { id } });
  }),

  updateStatus: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const existing = await QuoteModel.findById(id);
    if (!existing) throw new AppError(404, 'Quote not found');
    await QuoteModel.updateStatus(id, status);
    res.json({ success: true, data: { id, status } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await QuoteModel.findById(id);
    if (!existing) throw new AppError(404, 'Quote not found');
    if (existing.status !== 'Draft') throw new AppError(400, 'Only draft quotes can be deleted');
    await QuoteModel.delete(id);
    res.json({ success: true, data: { message: 'Quote deleted' } });
  }),

  download: catchAsync(async (req, res) => {
    const quote = await QuoteModel.findById(parseInt(req.params.id, 10));
    if (!quote) throw new AppError(404, 'Quote not found');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quote');

    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = `Quote: ${quote.quote_number}`;
    sheet.getCell('A1').font = { size: 16, bold: true };

    sheet.getCell('A3').value = 'Client:'; sheet.getCell('B3').value = quote.client_name;
    sheet.getCell('A4').value = 'Date:'; sheet.getCell('B4').value = quote.quote_date;
    sheet.getCell('A5').value = 'Valid Until:'; sheet.getCell('B5').value = quote.valid_until;
    sheet.getCell('A6').value = 'Status:'; sheet.getCell('B6').value = quote.status;

    const tableStart = 8;
    const headers = ['Description', 'Quantity', 'Unit Rate', 'Amount'];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(tableStart, i + 1);
      cell.value = h;
      cell.font = { bold: true };
    });

    quote.items.forEach((item, idx) => {
      const row = tableStart + 1 + idx;
      sheet.getCell(row, 1).value = item.description;
      sheet.getCell(row, 2).value = item.quantity;
      sheet.getCell(row, 3).value = item.unit_rate;
      sheet.getCell(row, 4).value = item.amount;
    });

    const summaryRow = tableStart + 1 + quote.items.length + 1;
    sheet.getCell(summaryRow, 3).value = 'Subtotal:';
    sheet.getCell(summaryRow, 4).value = quote.subtotal;
    sheet.getCell(summaryRow + 1, 3).value = `Tax (${quote.tax_percent}%):`;
    sheet.getCell(summaryRow + 1, 4).value = quote.tax_amount;
    sheet.getCell(summaryRow + 2, 3).value = 'Total:';
    sheet.getCell(summaryRow + 2, 3).font = { bold: true };
    sheet.getCell(summaryRow + 2, 4).value = quote.total_amount;
    sheet.getCell(summaryRow + 2, 4).font = { bold: true };

    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 15;
    sheet.getColumn(4).width = 15;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Quote_${quote.quote_number}.xlsx`);
    await workbook.xlsx.write(res);
  }),

  convertToPO: catchAsync(async (req, res) => {
    const quoteId = parseInt(req.params.id, 10);
    const quote = await QuoteModel.findById(quoteId);
    if (!quote) throw new AppError(404, 'Quote not found');
    if (quote.status !== 'Accepted') throw new AppError(400, 'Only accepted quotes can be converted to PO');

    const { po_number, po_date, start_date, end_date, alert_threshold } = req.body;

    const poId = await POModel.create({
      po_number,
      client_id: quote.client_id,
      quote_id: quoteId,
      po_date,
      start_date,
      end_date,
      po_value: quote.total_amount,
      alert_threshold: alert_threshold || 80,
    });

    res.status(201).json({ success: true, data: { poId, po_number } });
  }),
};

module.exports = quoteController;
