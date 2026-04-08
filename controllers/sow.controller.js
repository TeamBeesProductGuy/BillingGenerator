const fs = require('fs');
const path = require('path');
const SOWModel = require('../models/sow.model');
const QuoteModel = require('../models/quote.model');
const ClientModel = require('../models/client.model');
const env = require('../config/env');
const { generateQuoteDocxBuffer } = require('../services/quoteDocx.service');
const { AppError } = require('../middleware/errorHandler');
const catchAsync = require('../middleware/catchAsync');

function isEditableStatus(status) {
  return status === 'Draft' || status === 'Amendment Draft';
}

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

function ensureUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const parsed = path.parse(filePath);
  let counter = 1;
  let nextPath = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
  while (fs.existsSync(nextPath)) {
    counter += 1;
    nextPath = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
  }
  return nextPath;
}

function getLinkedDocumentsBaseDir() {
  return path.join(env.outputDir, 'sow-linked-documents');
}

function resolveLinkedDocumentPath(folderName, fileName) {
  const baseDir = getLinkedDocumentsBaseDir();
  const targetPath = path.resolve(baseDir, folderName || '', fileName || '');
  const normalizedBase = `${path.resolve(baseDir)}${path.sep}`;
  if (!targetPath.startsWith(normalizedBase)) {
    throw new AppError(400, 'Invalid document path');
  }
  return targetPath;
}

const sowController = {
  list: catchAsync(async (req, res) => {
    const { clientId, status } = req.query;
    const sows = await SOWModel.findAll(clientId ? parseInt(clientId, 10) : null, status);
    res.json({ success: true, data: sows });
  }),

  getById: catchAsync(async (req, res) => {
    const sow = await SOWModel.findById(parseInt(req.params.id, 10));
    if (!sow) throw new AppError(404, 'SOW not found');
    res.json({ success: true, data: sow });
  }),

  create: catchAsync(async (req, res) => {
    const { sow_number, client_id, quote_id, sow_date, effective_start, effective_end, notes, items } = req.body;
    const result = await SOWModel.create({ sow_number, client_id, quote_id, sow_date, effective_start, effective_end, notes }, items);
    res.status(201).json({ success: true, data: result });
  }),

  update: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');
    if (!isEditableStatus(existing.status)) throw new AppError(400, 'Only Draft or Amendment Draft SOWs can be edited');
    const { client_id, quote_id, sow_date, effective_start, effective_end, notes, items } = req.body;
    const result = await SOWModel.update(id, { client_id, quote_id, sow_date, effective_start, effective_end, notes }, items || []);
    res.json({ success: true, data: { id: result.id, sow_number: result.sow_number, replaced_sow_id: id } });
  }),

  amend: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');
    if (existing.status !== 'Signed') throw new AppError(400, 'Only signed SOWs can be amended');

    const { client_id, quote_id, sow_date, effective_start, effective_end, notes, items } = req.body;
    const result = await SOWModel.createAmendment(id, { client_id, quote_id, sow_date, effective_start, effective_end, notes }, items || []);
    res.status(201).json({ success: true, data: { id: result.id, sow_number: result.sow_number, amended_from_sow_id: id, status: 'Amendment Draft' } });
  }),

  updateStatus: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');

    const VALID_TRANSITIONS = {
      Draft: ['Signed'],
      'Amendment Draft': ['Signed'],
      Signed: ['Expired', 'Terminated'],
      Expired: [],
      Terminated: [],
    };
    const allowed = VALID_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status)) {
      throw new AppError(400, `Cannot change status from "${existing.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`);
    }

    await SOWModel.updateStatus(id, status);
    res.json({ success: true, data: { id, status } });
  }),

  remove: catchAsync(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = await SOWModel.findById(id);
    if (!existing) throw new AppError(404, 'SOW not found');
    if (!isEditableStatus(existing.status)) throw new AppError(400, 'Only Draft or Amendment Draft SOWs can be deleted');
    await SOWModel.delete(id);
    res.json({ success: true, data: { message: 'SOW deleted' } });
  }),

  listLinkedDocuments: catchAsync(async (req, res) => {
    const baseDir = getLinkedDocumentsBaseDir();
    if (!fs.existsSync(baseDir)) {
      res.json({ success: true, data: [] });
      return;
    }

    const folders = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const folderPath = path.join(baseDir, entry.name);
        const stats = fs.statSync(folderPath);
        const files = fs.readdirSync(folderPath, { withFileTypes: true })
          .filter((fileEntry) => fileEntry.isFile())
          .map((fileEntry) => {
            const filePath = path.join(folderPath, fileEntry.name);
            const fileStats = fs.statSync(filePath);
            return {
              name: fileEntry.name,
              size: fileStats.size,
              modified_at: fileStats.mtime.toISOString(),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          folder_name: entry.name,
          created_at: stats.birthtime.toISOString(),
          modified_at: stats.mtime.toISOString(),
          files,
        };
      })
      .sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    res.json({ success: true, data: folders });
  }),

  downloadLinkedDocument: catchAsync(async (req, res) => {
    const folderName = String(req.query.folder || '').trim();
    const fileName = String(req.query.file || '').trim();
    if (!folderName || !fileName) {
      throw new AppError(400, 'folder and file are required');
    }

    const filePath = resolveLinkedDocumentPath(folderName, fileName);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError(404, 'Document not found');
    }

    res.download(filePath, path.basename(filePath));
  }),

  deleteLinkedDocumentFolder: catchAsync(async (req, res) => {
    const folderName = String(req.query.folder || '').trim();
    if (!folderName) {
      throw new AppError(400, 'folder is required');
    }

    const folderPath = resolveLinkedDocumentPath(folderName);
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      throw new AppError(404, 'Folder not found');
    }

    fs.rmSync(folderPath, { recursive: true, force: true });
    res.json({ success: true, data: { folderName } });
  }),

  uploadLinkedDocuments: catchAsync(async (req, res) => {
    if (!req.file) throw new AppError(400, 'SOW file is required');
    const quoteId = parseInt(req.body.quote_id, 10);
    if (!quoteId) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      throw new AppError(400, 'quote_id is required');
    }

    try {
      const quote = await QuoteModel.findById(quoteId);
      if (!quote) throw new AppError(404, 'Quote not found');

      const client = await ClientModel.findById(quote.client_id);
      if (!client) throw new AppError(404, 'Client not found for quote');

      const candidateName = extractStructuredField(getMailFormatNotes(quote.notes), 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
      const folderName = [
        sanitizeSegment(client.abbreviation || 'client'),
        sanitizeSegment(candidateName || 'no_candidate'),
        formatFolderDate(quote.quote_date),
      ].filter(Boolean).join('_');

      const baseDir = getLinkedDocumentsBaseDir();
      const targetDir = path.join(baseDir, folderName);
      fs.mkdirSync(targetDir, { recursive: true });

      const quoteBuffer = await generateQuoteDocxBuffer(quote, client);
      const quoteDocxPath = ensureUniqueFilePath(path.join(targetDir, `${buildQuoteDocumentBaseName(quote, client)}.docx`));
      fs.writeFileSync(quoteDocxPath, quoteBuffer);

      const uploadedOriginal = path.basename(req.file.originalname || req.file.filename || 'uploaded_sow');
      const ext = path.extname(uploadedOriginal) || path.extname(req.file.path);
      const originalBase = path.basename(uploadedOriginal, ext);
      const sowDocPath = ensureUniqueFilePath(path.join(targetDir, `${sanitizeSegment(originalBase || 'sow_document')}${ext.toLowerCase()}`));
      fs.copyFileSync(req.file.path, sowDocPath);

      res.json({
        success: true,
        data: {
          folderName,
          folderPath: targetDir,
          quoteFile: path.basename(quoteDocxPath),
          sowFile: path.basename(sowDocPath),
        },
      });
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }),
};

module.exports = sowController;
