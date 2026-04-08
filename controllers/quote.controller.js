const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QuoteModel = require('../models/quote.model');
const ClientModel = require('../models/client.model');
const SOWModel = require('../models/sow.model');
const env = require('../config/env');
const { generateQuoteDocxBuffer } = require('../services/quoteDocx.service');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

const logoPath = path.join(__dirname, '..', 'public', 'images', 'TeamBees.png');
const quoteSideNoteMarker = '\n\n---SIDE_NOTE---\n';

function getMailFormatNotes(notes) {
  const raw = String(notes || '');
  const markerIndex = raw.indexOf(quoteSideNoteMarker);
  return markerIndex === -1 ? raw : raw.slice(0, markerIndex);
}

function extractStructuredField(mailNotes, label, nextLabels) {
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lookAhead = (nextLabels || []).map((item) => `\\n${escapeRegex(item)}:`).join('|');
  const endOfInput = '(?![\\s\\S])';
  const pattern = new RegExp(`^\\s*${escapeRegex(label)}:\\s*\\n?([\\s\\S]*?)(?=${lookAhead || endOfInput}|${endOfInput})`, 'im');
  const match = String(mailNotes || '').match(pattern);
  return match ? match[1].trim() : '';
}

function extractLegacyField(mailNotes, label) {
  const pattern = new RegExp(`^\\s*${label}\\s*:?\\s*(.+)$`, 'im');
  const match = String(mailNotes || '').match(pattern);
  return match ? match[1].trim() : '';
}

function splitAddressLines(value) {
  return String(value || '')
    .split(/\r?\n|[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function deriveQuoteLocations(items) {
  const uniqueLocations = [];
  (items || []).forEach((item) => {
    const value = String(item && item.location ? item.location : '').trim();
    if (!value) return;
    const exists = uniqueLocations.some((entry) => entry.toLowerCase() === value.toLowerCase());
    if (!exists) uniqueLocations.push(value);
  });
  return uniqueLocations.join(', ');
}

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 80);
}

function formatFolderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '').replace(/[^0-9]/g, '').substring(0, 8) || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildLinkedDocumentFolderName(quote, client) {
  const candidateName = extractStructuredField(getMailFormatNotes(quote.notes), 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
  return [
    sanitizeSegment((client && client.abbreviation) || 'client'),
    sanitizeSegment(candidateName || 'no_candidate'),
    formatFolderDate(quote.quote_date),
  ].filter(Boolean).join('_');
}

function buildQuoteDocumentBaseName(quote, client) {
  const candidateName = extractStructuredField(getMailFormatNotes(quote.notes), 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
  const description = ((quote && quote.items) || []).find((item) => String(item && item.description || '').trim());
  return [
    sanitizeSegment((client && client.abbreviation) || 'client'),
    sanitizeSegment(description ? description.description : 'quote'),
    sanitizeSegment(candidateName || 'no_candidate'),
    formatFolderDate(quote && quote.quote_date),
  ].filter(Boolean).join('_');
}

function deleteLinkedDocumentFolderForQuote(quote, client) {
  const folderName = buildLinkedDocumentFolderName(quote, client);
  const folderPath = path.join(env.outputDir, 'sow-linked-documents', folderName);
  if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

function formatDisplayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isQuoteTablePlaceholder(line) {
  const normalized = String(line || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return normalized === '[quote table will be inserted automatically in the word document]'
    || normalized === 'quote table will be inserted automatically in the word document'
    || normalized === '[quote table will be inserted automatically]'
    || normalized === 'quote table will be inserted automatically';
}

function buildPdfSubjectLine(quote) {
  const mailNotes = getMailFormatNotes(quote.notes);
  const subject = extractStructuredField(mailNotes, 'Subject', ['Candidate', 'Dear', 'Body', 'Regards', 'Designation']) || extractLegacyField(mailNotes, 'Subject');
  const candidateName = extractStructuredField(mailNotes, 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
  return subject ? (candidateName ? `Subject: ${subject} ("${candidateName}")` : `Subject: ${subject}`) : '';
}

function drawQuoteTable(doc, quote) {
  const startX = 70;
  const tableWidth = 460;
  const widths = [50, 280, 130];
  const headers = ['S. No.', 'Description', 'Cost'];
  const rowHeight = 22;
  let y = doc.y;

  const ensureSpace = (needed) => {
    if (y + needed > doc.page.height - 110) {
      doc.addPage();
      y = 60;
    }
  };

  ensureSpace((quote.items.length + 2) * rowHeight + 20);

  doc.font('Times-Bold').fontSize(10);
  let x = startX;
  headers.forEach((header, index) => {
    const align = index === 2 ? 'right' : (index === 0 ? 'center' : 'left');
    doc.rect(x, y, widths[index], rowHeight).stroke('#BFBFBF');
    doc.text(header, x + 6, y + 6, {
      width: widths[index] - 12,
      align,
    });
    x += widths[index];
  });
  y += rowHeight;

  doc.font('Times-Roman').fontSize(10);
  quote.items.forEach((item, index) => {
    x = startX;
    const cells = [
      String(index + 1),
      item.description || '',
      Number(item.amount || 0).toFixed(2),
    ];
    cells.forEach((cell, cellIndex) => {
      const align = cellIndex === 2 ? 'right' : (cellIndex === 0 ? 'center' : 'left');
      doc.rect(x, y, widths[cellIndex], rowHeight).stroke('#D9D9D9');
      doc.text(cell, x + 6, y + 6, {
        width: widths[cellIndex] - 12,
        align,
      });
      x += widths[cellIndex];
    });
    y += rowHeight;
  });

  x = startX;
  doc.font('Times-Bold').fontSize(10);
  ['', 'Total', Number(quote.total_amount || 0).toFixed(2)].forEach((cell, cellIndex) => {
    const align = cellIndex === 2 ? 'right' : (cellIndex === 0 ? 'center' : 'left');
    doc.rect(x, y, widths[cellIndex], rowHeight).stroke('#BFBFBF');
    doc.text(cell, x + 6, y + 6, {
      width: widths[cellIndex] - 12,
      align,
    });
    x += widths[cellIndex];
  });

  doc.moveDown(0.8);
}

function drawQuotePdf(doc, quote, client) {
  const mailNotes = getMailFormatNotes(quote.notes);
  const dear = extractStructuredField(mailNotes, 'Dear', ['Body', 'Regards', 'Designation']) || extractLegacyField(mailNotes, 'Dear').replace(/,\s*$/, '');
  const body = extractStructuredField(mailNotes, 'Body', ['Regards', 'Designation']) || [
    'Please refer to the following quote with best fitment to the requirements:',
    '1. Cost of resource (per man month):',
    '[Quote table will be inserted automatically in the Word document]',
    '2. Prevailing taxes, GST extra as applicable',
    '3. Location: [Auto-filled from line item locations]',
    '',
    'Kindly issue the Purchase Order (PO).'
  ].join('\n');
  const regards = extractStructuredField(mailNotes, 'Regards', ['Designation']) || extractLegacyField(mailNotes, 'Regards');
  const designation = extractStructuredField(mailNotes, 'Designation', []);
  const subjectLine = buildPdfSubjectLine(quote);
  const location = deriveQuoteLocations(quote.items || []);
  const addressLines = splitAddressLines((client && client.address) || '');
  const quoteDateLabel = formatDisplayDate(quote.quote_date);

  doc.font('Times-Roman').fontSize(10).fillColor('#1F2937');

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 70, 35, { width: 165 });
    doc.y = 88;
  } else {
    doc.font('Times-Bold').fontSize(10).text('TeamBees', 70, 50);
    doc.y = 88;
  }

  doc.font('Times-Bold').fontSize(10).fillColor('#475569')
    .text(`Quote No.: ${quote.quote_number || ''}`, 0, doc.y + 6, { align: 'right', width: doc.page.width - 70 });
  if (quoteDateLabel) {
    doc.font('Times-Roman').fontSize(10).fillColor('#475569')
      .text(`Date : ${quoteDateLabel}`, 0, doc.y + 2, { align: 'right', width: doc.page.width - 70 });
  }

  doc.moveDown(1.2);
  doc.font('Times-Roman').fontSize(10).fillColor('#475569').text('To,', 70);
  doc.font('Times-Bold').fontSize(10).fillColor('#0F172A').text(quote.client_name || '', 70);
  doc.font('Times-Roman').fontSize(10).fillColor('#475569');
  addressLines.forEach((line) => doc.text(line, 70));

  doc.moveDown(1);
  if (subjectLine) {
    doc.font('Times-Bold').fontSize(10).fillColor('#0F172A').text(subjectLine, 70);
    doc.moveDown(1);
  }
  if (dear) {
    doc.font('Times-Roman').fontSize(10).fillColor('#1F2937').text(`Dear ${dear},`, 70);
    doc.moveDown(0.8);
  }

  let insertedQuoteTable = false;
  body.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      doc.moveDown(0.7);
      return;
    }
    if (isQuoteTablePlaceholder(trimmed)) {
      if (insertedQuoteTable) return;
      drawQuoteTable(doc, quote);
      insertedQuoteTable = true;
      return;
    }
    if (!insertedQuoteTable && /^1\.\s*cost of resource/i.test(trimmed)) {
      doc.font('Times-Roman').fontSize(10).fillColor('#334155').text(trimmed, 70);
      doc.moveDown(0.5);
      drawQuoteTable(doc, quote);
      insertedQuoteTable = true;
      return;
    }
    if (/^3\.\s*Location\s*:/i.test(trimmed)) {
      doc.font('Times-Roman').fontSize(10).fillColor('#0F172A').text(`3. Location: ${location || '-'}`, 70);
      return;
    }
    doc.font('Times-Roman').fontSize(10).fillColor('#334155').text(trimmed, 70);
  });

  if (regards) {
    doc.moveDown(1);
    doc.font('Times-Roman').fontSize(10).fillColor('#0F172A').text('Regards,', 70);
    doc.moveDown(0.8);
    doc.text(regards, 70);
    if (designation) {
      doc.text(`(${designation})`, 70);
    }
  }

  const footerY = doc.page.height - 70;
  doc.font('Times-Roman').fontSize(8).fillColor('#475569');
  doc.text('63 GF, Block-G22, Sector-7', 70, footerY);
  doc.text('Rohini, Delhi-110085', 70, footerY + 12);
  doc.fillColor('#0563C1').text('www.teambeescorp.com', 70, footerY + 24, {
    link: 'https://www.teambeescorp.com/',
    underline: false,
  });
  doc.fillColor('#475569').text('Confidential & Proprietary', 0, footerY + 12, {
    align: 'right',
    width: doc.page.width - 70,
  });
}

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
    const { client_id, quote_date, valid_until, notes, items } = req.body;
    const result = await QuoteModel.create({ client_id, quote_date, valid_until, notes }, items);
    res.status(201).json({ success: true, data: result });
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await QuoteModel.findById(id);
    if (!existing) throw new AppError(404, 'Quote not found');
    if (existing.status !== 'Draft') throw new AppError(400, 'Only draft quotes can be edited');
    const { client_id, quote_date, valid_until, notes, items } = req.body;
    const result = await QuoteModel.update(id, { client_id, quote_date, valid_until, notes }, items || []);
    res.json({ success: true, data: { id: result.id, quote_number: result.quote_number, replaced_quote_id: id } });
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

    if (status === 'Expired' && existing.status === 'Accepted') {
      const client = await ClientModel.findById(existing.client_id);
      if (client) {
        deleteLinkedDocumentFolderForQuote(existing, client);
      }
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
    const client = await ClientModel.findById(quote.client_id);
    const buffer = await generateQuoteDocxBuffer(quote, client);
    const fileName = `${buildQuoteDocumentBaseName(quote, client)}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(buffer);
  }),

  downloadPDF: catchAsync(async (req, res) => {
    const quote = await QuoteModel.findById(parseInt(req.params.id, 10));
    if (!quote) throw new AppError(404, 'Quote not found');
    const client = await ClientModel.findById(quote.client_id);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Quote_${quote.quote_number}.pdf`);
    doc.pipe(res);
    drawQuotePdf(doc, quote, client);
    doc.end();
  }),

  convertToSOW: catchAsync(async (req, res) => {
    const quoteId = parseInt(req.params.id, 10);
    const quote = await QuoteModel.findById(quoteId);
    if (!quote) throw new AppError(404, 'Quote not found');
    if (quote.status !== 'Accepted') throw new AppError(400, 'Only accepted quotes can be converted to SOW');

    const { mode, sow_id, sow_number, sow_date, effective_start, effective_end, notes } = req.body;

    if (mode === 'existing') {
      if (!sow_id) throw new AppError(400, 'SOW selection is required to link an existing SOW');
      const existingSow = await SOWModel.findById(sow_id);
      if (!existingSow) throw new AppError(404, 'SOW not found');
      if (existingSow.client_id !== quote.client_id) {
        throw new AppError(400, 'Selected SOW belongs to a different client');
      }
      await SOWModel.linkQuote(sow_id, quoteId);
      return res.json({ success: true, data: { id: sow_id, sow_number: existingSow.sow_number, linked: true } });
    }

    if (!sow_number || !sow_date || !effective_start || !effective_end) {
      throw new AppError(400, 'SOW ID, SOW date, effective start, and effective end are required to create a new SOW');
    }

    const sowItems = quote.items.map((item) => ({
      role_position: item.description,
      quantity: item.quantity,
      amount: item.amount,
    }));

    const result = await SOWModel.create(
      { sow_number, client_id: quote.client_id, quote_id: quoteId, sow_date, effective_start, effective_end, notes },
      sowItems
    );

    res.status(201).json({ success: true, data: result });
  }),
};

module.exports = quoteController;
