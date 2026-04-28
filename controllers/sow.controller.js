const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/database');
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
const FOLDER_METADATA_FILE = '.folder-metadata.json';
const DOCUMENT_INDEX_TABLE = 'sow_document_index';

function isMissingRelationError(error, relationName) {
  return Boolean(
    error &&
    error.message &&
    error.message.toLowerCase().indexOf('relation') !== -1 &&
    error.message.toLowerCase().indexOf(String(relationName || '').toLowerCase()) !== -1
  );
}

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
    const fallback = new Date();
    const fallbackDay = String(fallback.getDate()).padStart(2, '0');
    const fallbackMonth = String(fallback.getMonth() + 1).padStart(2, '0');
    const fallbackYear = String(fallback.getFullYear()).slice(-2);
    return String(value || '').replace(/[^0-9]/g, '').substring(0, 6) || `${fallbackDay}${fallbackMonth}${fallbackYear}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
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

function buildQuoteDocumentBaseCore(quote, client) {
  const fullName = buildQuoteDocumentBaseName(quote, client);
  const parts = String(fullName || '').split('_').filter(Boolean);
  if (parts.length <= 1) return fullName;
  const last = parts[parts.length - 1];
  return /^\d{6}$/.test(last) ? parts.slice(0, -1).join('_') : fullName;
}

async function findLatestSowForQuote(quoteId) {
  if (!quoteId) return null;
  const { data, error } = await supabase
    .from('sows')
    .select('id, sow_number')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function resolveQuoteAndClientFromFolder(folderName, folderPath) {
  const metadata = readFolderMetadata(folderPath) || {};
  if (metadata.quote_id) {
    const quote = await QuoteModel.findById(metadata.quote_id);
    if (quote) {
      const client = await ClientModel.findById(quote.client_id);
      if (client) return { quote, client, metadata };
    }
  }

  const files = fs.existsSync(folderPath)
    ? fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== FOLDER_METADATA_FILE)
      .map((entry) => ({ name: entry.name }))
    : [];
  const enriched = await enrichFolderMetadata(folderName, folderPath, files, metadata);
  if (enriched && enriched.quote_id) {
    const quote = await QuoteModel.findById(enriched.quote_id);
    if (quote) {
      const client = await ClientModel.findById(quote.client_id);
      if (client) return { quote, client, metadata: enriched };
    }
  }

  return { quote: null, client: null, metadata: enriched || metadata };
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

function buildStoredDocumentPath(targetDir, originalName, fallbackBaseName) {
  const uploadedOriginal = path.basename(originalName || '');
  const ext = path.extname(uploadedOriginal).toLowerCase();
  const originalBase = path.basename(uploadedOriginal, ext);
  const baseName = sanitizeSegment(originalBase || fallbackBaseName);
  const safeExt = ext || '.docx';
  return ensureUniqueFilePath(path.join(targetDir, `${baseName}${safeExt}`));
}

function parseFolderName(folderName) {
  const parts = String(folderName || '').split('_').filter(Boolean);
  if (parts.length < 3) return { clientAbbreviation: '', candidateName: '' };
  const datePart = parts[parts.length - 1];
  const hasDate = /^\d{6}$/.test(datePart);
  const clientAbbreviation = parts[0] || '';
  const candidateParts = hasDate ? parts.slice(1, parts.length - 1) : parts.slice(1);
  return {
    clientAbbreviation,
    candidateName: candidateParts.join(' '),
  };
}

async function resolveClientFromFolderName(folderName) {
  const folder = String(folderName || '').trim();
  if (!folder) return null;

  const { data, error } = await supabase
    .from('clients')
    .select('id, client_name, abbreviation, is_active')
    .eq('is_active', true);
  if (error) throw new Error(error.message);

  const matches = (data || [])
    .map((client) => {
      const normalized = sanitizeSegment(client.abbreviation || '');
      return {
        client,
        normalized,
      };
    })
    .filter((item) => item.normalized && (folder === item.normalized || folder.indexOf(item.normalized + '_') === 0))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return matches.length > 0 ? matches[0].client : null;
}

function extractFolderDate(folderName) {
  const parts = String(folderName || '').split('_').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return /^\d{6}$/.test(last) ? last : '';
}

function toLowerSet(values) {
  const output = new Set();
  (values || []).forEach((value) => {
    const text = String(value || '').trim().toLowerCase();
    if (text) output.add(text);
  });
  return output;
}

function extractCandidatesFromFiles(files) {
  const candidates = [];
  (files || []).forEach((file) => {
    const fileName = String(file && file.name || '');
    if (!/\.docx$/i.test(fileName)) return;
    const base = path.basename(fileName, path.extname(fileName));
    const parts = base.split('_').filter(Boolean);
    if (parts.length < 4) return;
    // Generated quote docx format: <abbr>_<description>_<candidate>_<ddmmyy>
    const maybeDate = parts[parts.length - 1];
    if (!/^\d{6}$/.test(maybeDate)) return;
    const candidatePart = parts[parts.length - 2];
    if (candidatePart) candidates.push(candidatePart);
  });
  return uniqueStrings(candidates.map((value) => value.replace(/_/g, ' ')));
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  (values || []).forEach((value) => {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    output.push(text);
  });
  return output;
}

function readFolderMetadata(folderPath) {
  const metadataPath = path.join(folderPath, FOLDER_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function buildFallbackFolderMetadata(folderName, folderPath, files, indexedMetadata) {
  const metadata = Object.assign({}, indexedMetadata || {}, readFolderMetadata(folderPath) || {});
  const parsed = parseFolderName(folderName);
  const candidateNames = uniqueStrings(
    []
      .concat(metadata.candidate_names || [])
      .concat(metadata.candidate_name || '')
      .concat(parsed.candidateName || '')
      .concat(extractCandidatesFromFiles(files))
  );

  if (!metadata.client_abbreviation && parsed.clientAbbreviation) {
    metadata.client_abbreviation = parsed.clientAbbreviation;
  }
  if (!metadata.candidate_name) {
    metadata.candidate_name = candidateNames[0] || '';
  }
  metadata.candidate_names = candidateNames;
  metadata.roles = uniqueStrings(metadata.roles || []);
  metadata.sow_numbers = uniqueStrings(metadata.sow_numbers || []);
  metadata.quote_number = metadata.quote_number || '';
  metadata.updated_at = metadata.updated_at || new Date().toISOString();
  return metadata;
}

function writeFolderMetadata(folderPath, metadata) {
  const metadataPath = path.join(folderPath, FOLDER_METADATA_FILE);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
}

function matchesHint(text, hintSet) {
  const value = String(text || '').trim().toLowerCase();
  if (!value || !hintSet || hintSet.size === 0) return false;
  if (hintSet.has(value)) return true;
  for (const hint of hintSet) {
    if (value.indexOf(hint) !== -1 || hint.indexOf(value) !== -1) return true;
  }
  return false;
}

async function resolveQuoteFromFolder(clientId, folderName, candidateHints) {
  if (!clientId) return null;

  const folderDate = extractFolderDate(folderName);
  const candidateHintSet = toLowerSet(candidateHints);
  const quotesResult = await supabase
    .from('quotes')
    .select('id, quote_number, quote_date, notes')
    .eq('client_id', clientId)
    .order('quote_date', { ascending: false });
  if (quotesResult.error) return null;

  const quotes = quotesResult.data || [];
  const datedQuotes = folderDate
    ? quotes.filter((quote) => formatFolderDate(quote.quote_date) === folderDate)
    : quotes;
  const pool = datedQuotes.length > 0 ? datedQuotes : quotes;

  return pool.find((quote) => {
    const candidateName = extractStructuredField(getMailFormatNotes(quote.notes), 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
    return matchesHint(candidateName, candidateHintSet);
  }) || null;
}

async function buildFolderMetadataFromQuote(quote, client, candidateNameFromQuote) {
  const quoteId = quote && quote.id;
  const linkedSows = [];
  const roles = [];
  if (quoteId) {
    const sowResult = await supabase
      .from('sows')
      .select('id, sow_number')
      .eq('quote_id', quoteId);
    if (sowResult.error) throw new Error(sowResult.error.message);
    linkedSows.push(...(sowResult.data || []));

    const sowIds = linkedSows.map((sow) => sow.id);
    if (sowIds.length > 0) {
      const itemResult = await supabase
        .from('sow_items')
        .select('role_position')
        .in('sow_id', sowIds);
      if (itemResult.error) throw new Error(itemResult.error.message);
      roles.push(...(itemResult.data || []).map((row) => row.role_position));
    }
  }

  const fallbackCandidate = String(candidateNameFromQuote || '').trim();
  const normalizedCandidates = fallbackCandidate ? [fallbackCandidate] : [];

  return {
    quote_id: quote && quote.id ? quote.id : null,
    quote_number: quote && quote.quote_number ? quote.quote_number : '',
    client_id: client && client.id ? client.id : null,
    client_name: client && client.client_name ? client.client_name : '',
    client_abbreviation: client && client.abbreviation ? client.abbreviation : '',
    candidate_name: normalizedCandidates[0] || fallbackCandidate || '',
    candidate_names: normalizedCandidates,
    sow_numbers: uniqueStrings(linkedSows.map((sow) => sow.sow_number)),
    roles: uniqueStrings(roles),
    updated_at: new Date().toISOString(),
  };
}

async function upsertDocumentIndex(folderName, metadata) {
  const payload = {
    folder_name: folderName,
    quote_id: metadata.quote_id || null,
    client_id: metadata.client_id || null,
    client_abbreviation: metadata.client_abbreviation || null,
    candidate_name: metadata.candidate_name || null,
    sow_numbers: metadata.sow_numbers || [],
    roles: metadata.roles || [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(DOCUMENT_INDEX_TABLE)
    .upsert(payload, { onConflict: 'folder_name' });
  if (isMissingRelationError(error, DOCUMENT_INDEX_TABLE)) return;
  if (error) throw new Error(error.message);
}

async function loadDocumentIndexMap() {
  const { data, error } = await supabase
    .from(DOCUMENT_INDEX_TABLE)
    .select('*');
  if (isMissingRelationError(error, DOCUMENT_INDEX_TABLE)) return {};
  if (error && String(error.message || '').toLowerCase().indexOf('fetch failed') !== -1) return {};
  if (error) throw new Error(error.message);

  const indexMap = {};
  (data || []).forEach((row) => {
    indexMap[row.folder_name] = {
      quote_id: row.quote_id || null,
      client_id: row.client_id || null,
      client_abbreviation: row.client_abbreviation || '',
      candidate_name: row.candidate_name || '',
      sow_numbers: Array.isArray(row.sow_numbers) ? row.sow_numbers : [],
      roles: Array.isArray(row.roles) ? row.roles : [],
      updated_at: row.updated_at || null,
    };
  });
  return indexMap;
}

async function enrichFolderMetadata(folderName, folderPath, files, indexedMetadata) {
  let metadata = Object.assign({}, indexedMetadata || {}, readFolderMetadata(folderPath) || {});
  let parsed = parseFolderName(folderName);
  let resolvedClient = null;

  try {
    resolvedClient = await resolveClientFromFolderName(folderName);
  } catch (err) {
    resolvedClient = null;
  }

  if (resolvedClient) {
    const normalizedClientPrefix = sanitizeSegment(resolvedClient.abbreviation || '');
    const folderDate = extractFolderDate(folderName);
    var candidatePart = String(folderName || '');
    if (normalizedClientPrefix && candidatePart.indexOf(normalizedClientPrefix + '_') === 0) {
      candidatePart = candidatePart.slice((normalizedClientPrefix + '_').length);
    }
    if (folderDate && candidatePart.endsWith('_' + folderDate)) {
      candidatePart = candidatePart.slice(0, -1 * ('_' + folderDate).length);
    }
    parsed = {
      clientAbbreviation: resolvedClient.abbreviation || parsed.clientAbbreviation,
      candidateName: candidatePart.replace(/_/g, ' ').trim(),
    };
    metadata.client_id = resolvedClient.id;
    metadata.client_name = resolvedClient.client_name;
    metadata.client_abbreviation = resolvedClient.abbreviation;
  } else if (!metadata.client_abbreviation && parsed.clientAbbreviation) {
    metadata.client_abbreviation = parsed.clientAbbreviation;
  }

  const normalizedAbbreviation = String(parsed.clientAbbreviation || metadata.client_abbreviation || '').trim().toLowerCase();
  metadata.candidate_name = '';
  metadata.candidate_names = [];
  metadata.roles = [];
  metadata.sow_numbers = [];

  var clientId = metadata.client_id || null;
  if ((!metadata.client_name || !clientId) && normalizedAbbreviation) {
    const clientResult = await supabase
      .from('clients')
      .select('id, client_name, abbreviation')
      .eq('is_active', true)
      .order('client_name');
    if (!clientResult.error) {
      const matchedClient = (clientResult.data || []).find((row) => {
        return String(row.abbreviation || '').trim().toLowerCase() === normalizedAbbreviation;
      });
      if (matchedClient) {
        metadata.client_abbreviation = matchedClient.abbreviation || metadata.client_abbreviation;
        metadata.client_name = matchedClient.client_name || metadata.client_name;
        metadata.client_id = matchedClient.id;
        clientId = matchedClient.id;
      }
    }
  }

  // Canonical folder index mapping:
  // Candidate -> quote input, Role -> sow_items.role_position, Client -> clients.abbreviation
  const candidateHints = uniqueStrings(
    []
      .concat([parsed.candidateName || ''])
      .concat(extractCandidatesFromFiles(files))
  );

  if (!metadata.quote_id && clientId) {
    const matchedQuote = await resolveQuoteFromFolder(clientId, folderName, candidateHints);
    if (matchedQuote) {
      metadata.quote_id = matchedQuote.id;
      metadata.quote_number = matchedQuote.quote_number || metadata.quote_number || '';
    }
  }

  if (metadata.quote_id) {
    const quote = await QuoteModel.findById(metadata.quote_id);
    const client = quote ? await ClientModel.findById(quote.client_id) : null;
    if (quote && client) {
      const candidateName = extractStructuredField(getMailFormatNotes(quote.notes), 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
      metadata = Object.assign({}, metadata, await buildFolderMetadataFromQuote(quote, client, candidateName));
    }
  }

  metadata.updated_at = new Date().toISOString();
  writeFolderMetadata(folderPath, metadata);
  await upsertDocumentIndex(folderName, metadata);
  return metadata;
}

function folderMatchesFilters(folder, filters) {
  const metadata = folder.metadata || {};
  const folderName = String(folder.folder_name || '').toLowerCase();
  const searchValue = String(filters.search || '').toLowerCase();
  const clientValue = String(filters.client || '').toLowerCase();
  const candidateValue = String(filters.candidate || '').toLowerCase();
  const roleValue = String(filters.role || '').toLowerCase();
  const sowValue = String(filters.sow || '').toLowerCase();

  const clientText = String(metadata.client_abbreviation || metadata.client_name || '').toLowerCase();
  const candidateText = uniqueStrings((metadata.candidate_names || []).concat([metadata.candidate_name || ''])).join(' ').toLowerCase();
  const rolesText = (metadata.roles || []).join(' ').toLowerCase();
  const sowText = (metadata.sow_numbers || []).join(' ').toLowerCase();
  const quoteText = String(metadata.quote_number || '').toLowerCase();

  if (searchValue) {
    const aggregate = [folderName, clientText, candidateText, rolesText, sowText, quoteText].join(' ');
    if (aggregate.indexOf(searchValue) === -1) return false;
  }
  if (clientValue && clientText.indexOf(clientValue) === -1) return false;
  if (candidateValue && candidateText.indexOf(candidateValue) === -1) return false;
  if (roleValue && rolesText.indexOf(roleValue) === -1) return false;
  if (sowValue && sowText.indexOf(sowValue) === -1) return false;
  return true;
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

    let existingIndexMap = {};
    try {
      existingIndexMap = await loadDocumentIndexMap();
    } catch (err) {
      existingIndexMap = {};
    }
    const rawFolders = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const folderPath = path.join(baseDir, entry.name);
        const stats = fs.statSync(folderPath);
        const files = fs.readdirSync(folderPath, { withFileTypes: true })
          .filter((fileEntry) => fileEntry.isFile())
          .filter((fileEntry) => fileEntry.name !== FOLDER_METADATA_FILE)
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

        let metadata;
        try {
          metadata = await enrichFolderMetadata(entry.name, folderPath, files, existingIndexMap[entry.name]);
        } catch (err) {
          metadata = buildFallbackFolderMetadata(entry.name, folderPath, files, existingIndexMap[entry.name]);
        }
        return {
          folder_name: entry.name,
          created_at: stats.birthtime.toISOString(),
          modified_at: stats.mtime.toISOString(),
          metadata,
          files,
        };
      });

    let folders = await Promise.all(rawFolders);
    folders = folders
      .filter((folder) => folderMatchesFilters(folder, req.query || {}))
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
    try {
      const { error } = await supabase
        .from(DOCUMENT_INDEX_TABLE)
        .delete()
        .eq('folder_name', folderName);
      if (error && !isMissingRelationError(error, DOCUMENT_INDEX_TABLE)) {
        throw new Error(error.message);
      }
    } catch (err) {
      // Keep folder deletion successful even if the optional index cleanup cannot be completed.
    }
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

      const latestSow = await findLatestSowForQuote(quoteId);
      const latestSowNumber = latestSow && latestSow.sow_number ? latestSow.sow_number : '';
      const sowBaseName = [
        buildQuoteDocumentBaseCore(quote, client),
        latestSowNumber ? sanitizeSegment(latestSowNumber) : '',
        formatFolderDate(quote.quote_date),
      ].filter(Boolean).join('_');
      const sowDocPath = buildStoredDocumentPath(targetDir, `${sowBaseName}${path.extname(req.file.originalname || req.file.filename || '')}`, sowBaseName || 'sow_document');
      fs.copyFileSync(req.file.path, sowDocPath);

      const metadata = await buildFolderMetadataFromQuote(quote, client, candidateName);
      writeFolderMetadata(targetDir, metadata);

      res.json({
        success: true,
        data: {
          folderName,
          folderPath: targetDir,
          quoteFile: path.basename(quoteDocxPath),
          sowFile: path.basename(sowDocPath),
          metadata,
        },
      });
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }),

  uploadLinkedPODocument: catchAsync(async (req, res) => {
    if (!req.file) throw new AppError(400, 'PO file is required');
    const folderName = String(req.body.folder || '').trim();
    const poNumber = String(req.body.po_number || '').trim();
    if (!folderName) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      throw new AppError(400, 'folder is required');
    }
    if (!poNumber) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      throw new AppError(400, 'po_number is required');
    }

    try {
      const targetDir = resolveLinkedDocumentPath(folderName);
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        throw new AppError(404, 'Document folder not found');
      }

      const resolved = await resolveQuoteAndClientFromFolder(folderName, targetDir);
      const quote = resolved.quote;
      const client = resolved.client;
      const metadata = resolved.metadata || {};
      const sowNumber = Array.isArray(metadata.sow_numbers) && metadata.sow_numbers.length > 0 ? metadata.sow_numbers[0] : '';
      const dateToken = quote ? formatFolderDate(quote.quote_date) : formatFolderDate(new Date());
      const poBaseName = [
        quote && client ? buildQuoteDocumentBaseCore(quote, client) : sanitizeSegment(folderName),
        sowNumber ? sanitizeSegment(sowNumber) : '',
        sanitizeSegment(poNumber),
        dateToken,
      ].filter(Boolean).join('_');
      const poDocPath = buildStoredDocumentPath(targetDir, `${poBaseName}${path.extname(req.file.originalname || req.file.filename || '')}`, poBaseName || 'po_document');
      fs.copyFileSync(req.file.path, poDocPath);

      res.json({
        success: true,
        data: {
          folderName,
          poNumber,
          poFile: path.basename(poDocPath),
        },
      });
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }),
};

module.exports = sowController;
