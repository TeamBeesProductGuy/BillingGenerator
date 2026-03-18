const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
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

    // Enforce valid status transitions
    const VALID_TRANSITIONS = {
      Draft: ['Sent'],
      Sent: ['Accepted', 'Rejected'],
      Rejected: ['Draft'],
      Accepted: ['Expired'],
      Expired: [],
    };
    const allowed = VALID_TRANSITIONS[existing.status] || [];
    if (status !== 'Expired' && !allowed.includes(status)) {
      throw new AppError(400, `Cannot change status from "${existing.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`);
    }

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

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = `Quote: ${quote.quote_number}`;
    sheet.getCell('A1').font = { size: 16, bold: true };

    sheet.getCell('A3').value = 'Client:'; sheet.getCell('B3').value = quote.client_name;
    sheet.getCell('A4').value = 'Date:'; sheet.getCell('B4').value = quote.quote_date;
    sheet.getCell('A5').value = 'Valid Until:'; sheet.getCell('B5').value = quote.valid_until;
    sheet.getCell('A6').value = 'Status:'; sheet.getCell('B6').value = quote.status;

    const tableStart = 8;
    const headers = ['Description', 'Location', 'Quantity', 'Unit Rate', 'Amount'];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(tableStart, i + 1);
      cell.value = h;
      cell.font = { bold: true };
    });

    quote.items.forEach((item, idx) => {
      const row = tableStart + 1 + idx;
      sheet.getCell(row, 1).value = item.description;
      sheet.getCell(row, 2).value = item.location || '';
      sheet.getCell(row, 3).value = item.quantity;
      sheet.getCell(row, 4).value = item.unit_rate;
      sheet.getCell(row, 5).value = item.amount;
    });

    const summaryRow = tableStart + 1 + quote.items.length + 1;
    sheet.getCell(summaryRow, 4).value = 'Subtotal:';
    sheet.getCell(summaryRow, 5).value = quote.subtotal;
    sheet.getCell(summaryRow + 1, 4).value = `Tax (${quote.tax_percent}%):`;
    sheet.getCell(summaryRow + 1, 5).value = quote.tax_amount;
    sheet.getCell(summaryRow + 2, 4).value = 'Total:';
    sheet.getCell(summaryRow + 2, 4).font = { bold: true };
    sheet.getCell(summaryRow + 2, 5).value = quote.total_amount;
    sheet.getCell(summaryRow + 2, 5).font = { bold: true };

    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 18;
    sheet.getColumn(3).width = 12;
    sheet.getColumn(4).width = 15;
    sheet.getColumn(5).width = 15;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Quote_${quote.quote_number}.xlsx`);
    await workbook.xlsx.write(res);
  }),

  downloadPDF: catchAsync(async (req, res) => {
    const quote = await QuoteModel.findById(parseInt(req.params.id, 10));
    if (!quote) throw new AppError(404, 'Quote not found');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Quote_${quote.quote_number}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('TeamBees', { align: 'left' });
    doc.fontSize(10).font('Helvetica').text('Billing Engine', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').text(`Quote: ${quote.quote_number}`);
    doc.moveDown(0.5);

    // Quote info
    doc.fontSize(10).font('Helvetica');
    doc.text(`Client: ${quote.client_name}`);
    doc.text(`Date: ${quote.quote_date}`);
    doc.text(`Valid Until: ${quote.valid_until}`);
    doc.text(`Status: ${quote.status}`);
    doc.moveDown();

    // Items table header
    const tableTop = doc.y;
    const colX = [50, 200, 310, 380, 460];
    const colHeaders = ['Description', 'Location', 'Qty', 'Unit Rate', 'Amount'];
    doc.font('Helvetica-Bold').fontSize(9);
    colHeaders.forEach((h, i) => doc.text(h, colX[i], tableTop, { width: (colX[i + 1] || 545) - colX[i] }));
    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke();

    // Items rows
    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    quote.items.forEach((item) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.text(item.description, colX[0], y, { width: 145 });
      doc.text(item.location || '', colX[1], y, { width: 105 });
      doc.text(String(item.quantity), colX[2], y, { width: 65 });
      doc.text(Number(item.unit_rate).toFixed(2), colX[3], y, { width: 75 });
      doc.text(Number(item.amount).toFixed(2), colX[4], y, { width: 80, align: 'right' });
      y += 16;
    });

    // Summary
    y += 10;
    doc.moveTo(350, y).lineTo(545, y).stroke();
    y += 8;
    doc.font('Helvetica').text('Subtotal:', 350, y);
    doc.text(Number(quote.subtotal).toFixed(2), 460, y, { width: 80, align: 'right' });
    y += 16;
    doc.text(`Tax (${quote.tax_percent}%):`, 350, y);
    doc.text(Number(quote.tax_amount).toFixed(2), 460, y, { width: 80, align: 'right' });
    y += 16;
    doc.font('Helvetica-Bold').text('Total:', 350, y);
    doc.text(Number(quote.total_amount).toFixed(2), 460, y, { width: 80, align: 'right' });

    if (quote.notes) {
      y += 30;
      doc.font('Helvetica').fontSize(9).text(`Notes: ${quote.notes}`, 50, y, { width: 495 });
    }

    doc.end();
  }),

  convertToPO: catchAsync(async (req, res) => {
    const quoteId = parseInt(req.params.id, 10);
    const quote = await QuoteModel.findById(quoteId);
    if (!quote) throw new AppError(404, 'Quote not found');
    if (quote.status !== 'Accepted') throw new AppError(400, 'Only accepted quotes can be converted to PO');

    const { po_number, po_date, start_date, end_date, alert_threshold, sow_id } = req.body;

    const poId = await POModel.create({
      po_number,
      client_id: quote.client_id,
      quote_id: quoteId,
      po_date,
      start_date,
      end_date,
      po_value: quote.total_amount,
      alert_threshold: alert_threshold || 80,
      sow_id: sow_id || null,
    });

    res.status(201).json({ success: true, data: { poId, po_number } });
  }),
};

module.exports = quoteController;
