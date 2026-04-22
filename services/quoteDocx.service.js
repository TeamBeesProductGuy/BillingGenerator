const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '..', 'public', 'images', 'TeamBeesLOgo.png');
const sideNoteMarker = '\n\n---SIDE_NOTE---\n';
const DEFAULT_FONT = 'Calibri';
const DEFAULT_FONT_SIZE = 20;
const FOOTER_FONT_SIZE = 15;
const LOGO_WIDTH_EMU = 2121408;
const LOGO_HEIGHT_EMU = 1106424;
const HEADER_LEFT_OFFSET_DXA = -446;
const FOOTER_LEFT_OFFSET_DXA = 0;
const FOOTER_TABLE_WIDTH_DXA = 10360;
const FOOTER_LEFT_CELL_WIDTH_DXA = 6720;
const FOOTER_RIGHT_CELL_WIDTH_DXA = 3640;
const FOOTER_LEFT_TEXT_INDENT_DXA = 0;

function getLogoExtent() {
  return {
    width: LOGO_WIDTH_EMU,
    height: LOGO_HEIGHT_EMU,
  };
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTextXml(value) {
  const parts = String(value || '').split('\n');
  return parts.map((part, index) => {
    const prefix = index === 0 ? '' : '<w:br/>';
    return `${prefix}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`;
  }).join('');
}

function makeParagraph(text, options) {
  const style = options && options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
  const spacingAfter = options && options.spacingAfter ? `<w:spacing w:after="${options.spacingAfter}"/>` : '';
  const spacingBefore = options && options.spacingBefore ? `<w:spacing w:before="${options.spacingBefore}"/>` : '';
  const justify = options && options.justify ? `<w:jc w:val="${options.justify}"/>` : '';
  const bold = options && options.bold ? '<w:b/>' : '';
  const resolvedSize = options && options.size ? options.size : DEFAULT_FONT_SIZE;
  const size = `<w:sz w:val="${resolvedSize}"/>`;
  const color = options && options.color ? `<w:color w:val="${options.color}"/>` : '';
  const italic = options && options.italic ? '<w:i/>' : '';
  const caps = options && options.caps ? '<w:caps/>' : '';
  const font = options && options.font ? `<w:rFonts w:ascii="${options.font}" w:hAnsi="${options.font}" w:cs="${options.font}"/>` : '';

  return `<w:p>
    <w:pPr>${style}${spacingBefore}${spacingAfter}${justify}</w:pPr>
    <w:r>
      <w:rPr>${font}${bold}${italic}${caps}${size}${color}</w:rPr>
      ${buildTextXml(text)}
    </w:r>
  </w:p>`;
}

function makeImageParagraph() {
  const logoExtent = getLogoExtent();
  return `<w:p>
    <w:pPr>
      <w:jc w:val="left"/>
      <w:ind w:left="${HEADER_LEFT_OFFSET_DXA}"/>
      <w:spacing w:after="120"/>
    </w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0"
          xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <wp:extent cx="${logoExtent.width}" cy="${logoExtent.height}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="TeamBees Logo"/>
          <wp:cNvGraphicFramePr/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="TeamBees.png"/>
                  <pic:cNvPicPr preferRelativeResize="0">
                    <a:picLocks noChangeAspect="0"/>
                  </pic:cNvPicPr>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rIdLogo"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${logoExtent.width}" cy="${logoExtent.height}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function buildHeaderXml(hasLogo) {
  const headerContent = hasLogo
    ? `${makeImageParagraph()}
    ${makeDividerParagraph('D6DCE5')}`
    : `${makeParagraph('TeamBees', { bold: true, size: DEFAULT_FONT_SIZE, color: '1F1F1F', spacingAfter: 80, font: DEFAULT_FONT })}
    ${makeParagraph('BUILDING ON TRUST', { size: DEFAULT_FONT_SIZE, color: '6D6D6D', spacingAfter: 120, caps: true, font: DEFAULT_FONT })}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:hdr xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
    xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
    xmlns:v="urn:schemas-microsoft-com:vml"
    xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:w10="urn:schemas-microsoft-com:office:word"
    xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
    xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
    xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
    xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
    xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
    xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
    mc:Ignorable="w14 w15 wp14">
    ${headerContent}
  </w:hdr>`;
}

function makeTableCell(text, width, options) {
  const bold = options && options.bold ? '<w:b/>' : '';
  const justify = options && options.justify ? `<w:jc w:val="${options.justify}"/>` : '';
  const fill = options && options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '';
  const color = options && options.color ? `<w:color w:val="${options.color}"/>` : '';
  const resolvedSize = options && options.size ? options.size : DEFAULT_FONT_SIZE;
  const size = `<w:sz w:val="${resolvedSize}"/>`;
  const font = options && options.font ? `<w:rFonts w:ascii="${options.font}" w:hAnsi="${options.font}" w:cs="${options.font}"/>` : '';
  const spacing = options && options.spacing ? `<w:spacing w:before="${options.spacing}" w:after="${options.spacing}"/>` : '';
  const noWrap = options && options.noWrap ? '<w:noWrap/>' : '';

  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${fill}
      ${noWrap}
    </w:tcPr>
    <w:p>
      <w:pPr>${justify}${spacing}</w:pPr>
      <w:r>
        <w:rPr>${font}${bold}${color}${size}</w:rPr>
        <w:t xml:space="preserve">${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:tc>`;
}

function makeTableRow(cells) {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

function makeDividerParagraph(color) {
  return `<w:p>
    <w:pPr>
      <w:ind w:left="-40" w:right="120"/>
      <w:spacing w:after="220"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="10" w:space="1" w:color="${color || 'D1D5DB'}"/>
      </w:pBdr>
    </w:pPr>
  </w:p>`;
}

function formatDisplayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatIndianCurrencyNumber(value) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function splitAddressLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatAddressLinesForDocument(value) {
  const lines = splitAddressLines(value);
  return lines.map((line, index) => (index === lines.length - 1 ? line : `${line},`));
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

function buildFooterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:ftr xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
    xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
    xmlns:v="urn:schemas-microsoft-com:vml"
    xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:w10="urn:schemas-microsoft-com:office:word"
    xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
    xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
    xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
    xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
    xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
    xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
    mc:Ignorable="w14 w15 wp14">
    ${makeDividerParagraph('D6DCE5')}
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${FOOTER_TABLE_WIDTH_DXA}" w:type="dxa"/>
        <w:jc w:val="left"/>
        <w:tblInd w:w="${FOOTER_LEFT_OFFSET_DXA}" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="nil"/>
          <w:left w:val="nil"/>
          <w:bottom w:val="nil"/>
          <w:right w:val="nil"/>
          <w:insideH w:val="nil"/>
          <w:insideV w:val="nil"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="${FOOTER_LEFT_CELL_WIDTH_DXA}"/>
        <w:gridCol w:w="${FOOTER_RIGHT_CELL_WIDTH_DXA}"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${FOOTER_LEFT_CELL_WIDTH_DXA}" w:type="dxa"/>
            <w:vAlign w:val="bottom"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:after="20"/>
              <w:ind w:left="${FOOTER_LEFT_TEXT_INDENT_DXA}"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                <w:sz w:val="${FOOTER_FONT_SIZE}"/>
                <w:color w:val="475569"/>
              </w:rPr>
              <w:t>63 GF, Block-G22, Sector-7</w:t>
            </w:r>
          </w:p>
          <w:p>
            <w:pPr>
              <w:spacing w:after="20"/>
              <w:ind w:left="${FOOTER_LEFT_TEXT_INDENT_DXA}"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                <w:sz w:val="${FOOTER_FONT_SIZE}"/>
                <w:color w:val="475569"/>
              </w:rPr>
              <w:t>Rohini, Delhi-110085</w:t>
            </w:r>
          </w:p>
          <w:p>
            <w:pPr>
              <w:spacing w:after="0"/>
              <w:ind w:left="${FOOTER_LEFT_TEXT_INDENT_DXA}"/>
            </w:pPr>
            <w:hyperlink r:id="rIdWebsite">
              <w:r>
                <w:rPr>
                  <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                  <w:color w:val="0563C1"/>
                  <w:sz w:val="${FOOTER_FONT_SIZE}"/>
                </w:rPr>
                <w:t>www.teambeescorp.com</w:t>
              </w:r>
            </w:hyperlink>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${FOOTER_RIGHT_CELL_WIDTH_DXA}" w:type="dxa"/>
            <w:vAlign w:val="bottom"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:after="160"/>
            </w:pPr>
          </w:p>
          <w:p>
            <w:pPr>
              <w:jc w:val="right"/>
              <w:spacing w:after="0"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                <w:sz w:val="${FOOTER_FONT_SIZE}"/>
                <w:color w:val="475569"/>
              </w:rPr>
              <w:t>Confidential &amp; Proprietary</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:ftr>`;
}

function getMailFormatNotes(notes) {
  const raw = String(notes || '');
  const markerIndex = raw.indexOf(sideNoteMarker);
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

function buildQuoteItemsTableXml(quote) {
  const items = quote.items || [];
  const tableRows = [];
  tableRows.push(makeTableRow([
    makeTableCell('S. No.', 980, { bold: true, justify: 'center', color: '000000', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, spacing: 40, noWrap: true }),
    makeTableCell('Description', 5980, { bold: true, justify: 'center', color: '000000', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, spacing: 40 }),
    makeTableCell('Service Fee Monthly (INR)', 2400, { bold: true, justify: 'center', color: '000000', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT, spacing: 40 }),
  ]));

  items.forEach(function (item, index) {
    tableRows.push(makeTableRow([
      makeTableCell(String(index + 1), 980, { justify: 'center', font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE, spacing: 28, color: '000000' }),
      makeTableCell(item.description || '', 5980, { font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE, spacing: 28, color: '000000' }),
      makeTableCell(formatIndianCurrencyNumber(item.amount || 0), 2400, { justify: 'right', font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE, spacing: 28, color: '000000' }),
    ]));
  });

  tableRows.push(makeTableRow([
    makeTableCell('', 980, {}),
    makeTableCell('Total', 5980, { font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE, spacing: 28, color: '000000' }),
    makeTableCell(formatIndianCurrencyNumber(quote.total_amount || 0), 2400, { justify: 'right', font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE, spacing: 28, color: '000000' }),
  ]));

  return `<w:tbl>
    <w:tblPr>
      <w:jc w:val="center"/>
      <w:tblW w:w="9360" w:type="dxa"/>
      <w:tblCellMar>
        <w:top w:w="90" w:type="dxa"/>
        <w:left w:w="110" w:type="dxa"/>
        <w:bottom w:w="90" w:type="dxa"/>
        <w:right w:w="110" w:type="dxa"/>
      </w:tblCellMar>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="6" w:space="0" w:color="000000"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="980"/>
      <w:gridCol w:w="5980"/>
      <w:gridCol w:w="2400"/>
    </w:tblGrid>
    ${tableRows.join('')}
  </w:tbl>`;
}

function buildQuoteDocumentXml(quote, client) {
  const items = quote.items || [];
  const mailNotes = getMailFormatNotes(quote.notes);
  const subject = extractStructuredField(mailNotes, 'Subject', ['Candidate', 'Dear', 'Body', 'Regards', 'Designation']) || extractLegacyField(mailNotes, 'Subject');
  const candidateName = extractStructuredField(mailNotes, 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
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
  const location = deriveQuoteLocations(items);
  const regards = extractStructuredField(mailNotes, 'Regards', ['Designation']) || extractLegacyField(mailNotes, 'Regards');
  const designation = extractStructuredField(mailNotes, 'Designation', []);
  const addressLines = formatAddressLinesForDocument((client && client.address) || '');
  const quoteDateLabel = formatDisplayDate(quote.quote_date);

  const content = [];
  if (quote.quote_number) {
    content.push(makeParagraph(`Quote No.: ${quote.quote_number}`, {
      justify: 'right',
      spacingAfter: 90,
      font: DEFAULT_FONT,
      size: DEFAULT_FONT_SIZE,
      color: '000000',
      bold: true,
    }));
  }
  if (quoteDateLabel) {
    content.push(makeParagraph(`Date: ${quoteDateLabel}`, {
      justify: 'right',
      spacingAfter: 130,
      font: DEFAULT_FONT,
      size: DEFAULT_FONT_SIZE,
      color: '000000',
    }));
  }
  content.push(makeParagraph('To,', { spacingAfter: 70, font: DEFAULT_FONT, color: '000000', size: DEFAULT_FONT_SIZE }));
  content.push(makeParagraph(quote.client_name || '', { size: DEFAULT_FONT_SIZE, spacingAfter: 70, font: DEFAULT_FONT, color: '000000' }));
  addressLines.forEach(function (line) {
    content.push(makeParagraph(line, { color: '000000', spacingAfter: 40, font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }));
  });
  content.push(makeParagraph('', { spacingAfter: 120 }));

  if (subject) {
    const subjectLine = candidateName ? `Subject: ${subject} ("${candidateName}")` : `Subject: ${subject}`;
    content.push(makeParagraph(subjectLine, { size: DEFAULT_FONT_SIZE, spacingAfter: 90, font: DEFAULT_FONT, color: '000000' }));
  }
  if (dear) {
    content.push(makeParagraph('', { spacingAfter: 70 }));
    content.push(makeParagraph(`Dear ${dear},`, {
      spacingAfter: 70,
      font: DEFAULT_FONT,
      color: '000000',
      size: DEFAULT_FONT_SIZE,
    }));
    content.push(makeParagraph('', { spacingAfter: 70 }));
  }

  var insertedQuoteTable = false;
  body.split(/\r?\n/).forEach(function (line) {
    var trimmed = String(line || '').trim();
    if (!trimmed) {
      content.push(makeParagraph('', { spacingAfter: 70 }));
      return;
    }
    if (isQuoteTablePlaceholder(trimmed)) {
      if (insertedQuoteTable) {
        return;
      }
      content.push(buildQuoteItemsTableXml(quote));
      content.push(makeParagraph('', { spacingAfter: 90 }));
      insertedQuoteTable = true;
      return;
    }
    if (!insertedQuoteTable && /^1\.\s*cost of resource/i.test(trimmed)) {
      content.push(makeParagraph(trimmed, { spacingAfter: 90, font: DEFAULT_FONT, color: '000000', size: DEFAULT_FONT_SIZE }));
      content.push(buildQuoteItemsTableXml(quote));
      content.push(makeParagraph('', { spacingAfter: 90 }));
      insertedQuoteTable = true;
      return;
    }
    if (/^3\.\s*Location\s*:/i.test(trimmed)) {
      content.push(makeParagraph(`3. Location: ${location || '-'}`, { spacingAfter: 90, font: DEFAULT_FONT, color: '000000', size: DEFAULT_FONT_SIZE }));
      return;
    }
    content.push(makeParagraph(trimmed, { spacingAfter: 90, font: DEFAULT_FONT, color: '000000', size: DEFAULT_FONT_SIZE }));
  });

  if (regards) {
    content.push(makeParagraph('Regards,', {
      spacingBefore: 70,
      spacingAfter: 80,
      font: DEFAULT_FONT,
      color: '000000',
      size: DEFAULT_FONT_SIZE,
    }));
    content.push(makeParagraph(regards, {
      spacingAfter: designation ? 40 : 90,
      font: DEFAULT_FONT,
      color: '000000',
      size: DEFAULT_FONT_SIZE,
    }));
  }
  if (designation) {
    content.push(makeParagraph(`(${designation})`, {
      spacingAfter: 90,
      font: DEFAULT_FONT,
      color: '000000',
      size: DEFAULT_FONT_SIZE,
    }));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
    xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
    xmlns:v="urn:schemas-microsoft-com:vml"
    xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:w10="urn:schemas-microsoft-com:office:word"
    xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
    xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
    xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
    xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
    xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
    xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
    mc:Ignorable="w14 w15 wp14">
    <w:body>
      ${content.join('')}
      <w:sectPr>
        <w:headerReference w:type="default" r:id="rIdHeader1"/>
        <w:footerReference w:type="default" r:id="rIdFooter1"/>
        <w:pgSz w:w="12240" w:h="15840"/>
        <w:pgMar w:top="1008" w:right="900" w:bottom="936" w:left="900" w:header="446" w:footer="540" w:gutter="0"/>
      </w:sectPr>
    </w:body>
  </w:document>`;
}

async function generateQuoteDocxBuffer(quote, client) {
  const zip = new JSZip();
  const hasLogo = fs.existsSync(logoPath);

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Default Extension="jpeg" ContentType="image/jpeg"/>
    <Default Extension="png" ContentType="image/png"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
    <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  </Types>`);

  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
    <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  </Relationships>`);

  zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:dcterms="http://purl.org/dc/terms/"
    xmlns:dcmitype="http://purl.org/dc/dcmitype/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <dc:title>Quote ${escapeXml(quote.quote_number)}</dc:title>
    <dc:creator>Billing Engine</dc:creator>
    <cp:lastModifiedBy>Billing Engine</cp:lastModifiedBy>
    <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
    <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
  </cp:coreProperties>`);

  zip.folder('docProps').file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
    xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
    <Application>Billing Engine</Application>
  </Properties>`);

  const word = zip.folder('word');
  word.file('document.xml', buildQuoteDocumentXml(quote, client));
  word.file('header1.xml', buildHeaderXml(hasLogo));
  word.file('footer1.xml', buildFooterXml());
  word.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
      <w:name w:val="Normal"/>
      <w:qFormat/>
      <w:rPr>
        <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
        <w:sz w:val="${DEFAULT_FONT_SIZE}"/>
        <w:szCs w:val="${DEFAULT_FONT_SIZE}"/>
        <w:color w:val="1F2937"/>
      </w:rPr>
    </w:style>
  </w:styles>`);
  if (hasLogo) {
    word.folder('media').file('TeamBeesLOgo.png', fs.readFileSync(logoPath));
  }
  word.folder('_rels').file('header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${hasLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/TeamBeesLOgo.png"/>' : ''}
  </Relationships>`);
  word.folder('_rels').file('footer1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdWebsite" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.teambeescorp.com/" TargetMode="External"/>
  </Relationships>`);
  word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
    <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  </Relationships>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { generateQuoteDocxBuffer };
