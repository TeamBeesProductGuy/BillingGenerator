const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '..', 'public', 'images', 'TeamBees.png');
const sideNoteMarker = '\n\n---SIDE_NOTE---\n';
const DEFAULT_FONT = 'Times New Roman';
const DEFAULT_FONT_SIZE = 20;

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
  return `<w:p>
    <w:pPr>
      <w:jc w:val="left"/>
      <w:spacing w:after="0"/>
    </w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0"
          xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <wp:extent cx="3438000" cy="1335600"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="TeamBees Logo"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="TeamBees.png"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rIdLogo"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="3438000" cy="1335600"/>
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
    ? `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
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
        <w:gridCol w:w="5400"/>
        <w:gridCol w:w="3960"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="5400" w:type="dxa"/>
            <w:vAlign w:val="top"/>
          </w:tcPr>
          ${makeImageParagraph()}
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3960" w:type="dxa"/>
            <w:vAlign w:val="top"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:jc w:val="right"/>
              <w:spacing w:after="0"/>
            </w:pPr>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>`
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

  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${fill}
    </w:tcPr>
    <w:p>
      <w:pPr>${justify}</w:pPr>
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
      <w:spacing w:after="160"/>
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

function splitAddressLines(value) {
  const rawLines = String(value || '').split(/\r?\n/);
  const lines = [];

  rawLines.forEach((rawLine) => {
    const source = String(rawLine || '').trim();
    if (!source) return;

    const parts = source.match(/[^,;]+[;,]?/g) || [];
    parts.forEach((part) => {
      const line = String(part || '').trim();
      if (line) lines.push(line);
    });
  });

  return lines;
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
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
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
        <w:gridCol w:w="5200"/>
        <w:gridCol w:w="3200"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="5200" w:type="dxa"/>
            <w:vAlign w:val="bottom"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:after="20"/></w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                <w:sz w:val="16"/>
                <w:color w:val="475569"/>
              </w:rPr>
              <w:t>63 GF, Block-G22, Sector-7</w:t>
            </w:r>
          </w:p>
          <w:p>
            <w:pPr><w:spacing w:after="20"/></w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                <w:sz w:val="16"/>
                <w:color w:val="475569"/>
              </w:rPr>
              <w:t>Rohini, Delhi-110085</w:t>
            </w:r>
          </w:p>
          <w:p>
            <w:pPr><w:spacing w:after="0"/></w:pPr>
            <w:hyperlink r:id="rIdWebsite">
              <w:r>
                <w:rPr>
                  <w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/>
                  <w:color w:val="0563C1"/>
                  <w:sz w:val="16"/>
                </w:rPr>
                <w:t>www.teambeescorp.com</w:t>
              </w:r>
            </w:hyperlink>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3200" w:type="dxa"/>
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
                <w:sz w:val="16"/>
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
    makeTableCell('S. No.', 980, { bold: true, justify: 'center', color: '000000', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
    makeTableCell('Description', 5980, { bold: true, color: '000000', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
    makeTableCell('Cost', 2400, { bold: true, justify: 'right', color: '000000', size: DEFAULT_FONT_SIZE, font: DEFAULT_FONT }),
  ]));

  items.forEach(function (item, index) {
    tableRows.push(makeTableRow([
      makeTableCell(String(index + 1), 980, { justify: 'center', font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }),
      makeTableCell(item.description || '', 5980, { font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }),
      makeTableCell(Number(item.amount || 0).toFixed(2), 2400, { justify: 'right', font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }),
    ]));
  });

  tableRows.push(makeTableRow([
    makeTableCell('', 980, {}),
    makeTableCell('Total', 5980, { bold: true, font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }),
    makeTableCell(Number(quote.total_amount || 0).toFixed(2), 2400, { bold: true, justify: 'right', font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }),
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
        <w:top w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
        <w:insideH w:val="single" w:sz="5" w:space="0" w:color="D9D9D9"/>
        <w:insideV w:val="single" w:sz="5" w:space="0" w:color="D9D9D9"/>
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
  const addressLines = splitAddressLines((client && client.address) || '');
  const quoteDateLabel = formatDisplayDate(quote.quote_date);

  const content = [];
  if (!fs.existsSync(logoPath)) {
    content.push(makeParagraph('TeamBees', { bold: true, size: DEFAULT_FONT_SIZE, color: '1F1F1F', spacingAfter: 80, font: DEFAULT_FONT }));
    content.push(makeParagraph('BUILDING ON TRUST', { size: DEFAULT_FONT_SIZE, color: '6D6D6D', spacingAfter: 120, caps: true, font: DEFAULT_FONT }));
  }
  if (quote.quote_number) {
    content.push(makeParagraph(`Quote No.: ${quote.quote_number}`, {
      justify: 'right',
      spacingAfter: 80,
      font: DEFAULT_FONT,
      size: DEFAULT_FONT_SIZE,
      color: '475569',
      bold: true,
    }));
  }
  if (quoteDateLabel) {
    content.push(makeParagraph(`Date : ${quoteDateLabel}`, {
      justify: 'right',
      spacingAfter: 160,
      font: DEFAULT_FONT,
      size: DEFAULT_FONT_SIZE,
      color: '475569',
    }));
  }
  content.push(makeParagraph('To,', { spacingAfter: 90, font: DEFAULT_FONT, color: '475569', size: DEFAULT_FONT_SIZE }));
  content.push(makeParagraph(quote.client_name || '', { size: DEFAULT_FONT_SIZE, spacingAfter: 120, font: DEFAULT_FONT, color: '0F172A' }));
  addressLines.forEach(function (line) {
    content.push(makeParagraph(line, { color: '475569', spacingAfter: 100, font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE }));
  });
  content.push(makeParagraph('', { spacingAfter: 240 }));

  if (subject) {
    const subjectLine = candidateName ? `Subject: ${subject} ("${candidateName}")` : `Subject: ${subject}`;
    content.push(makeParagraph(subjectLine, { size: DEFAULT_FONT_SIZE, spacingAfter: 120, font: DEFAULT_FONT, color: '0F172A' }));
  }
  if (dear) content.push(makeParagraph(`Dear ${dear},`, { spacingAfter: 200, font: DEFAULT_FONT, color: '1F2937', size: DEFAULT_FONT_SIZE }));

  var insertedQuoteTable = false;
  body.split(/\r?\n/).forEach(function (line) {
    var trimmed = String(line || '').trim();
    if (!trimmed) {
      content.push(makeParagraph('', { spacingAfter: 120 }));
      return;
    }
    if (isQuoteTablePlaceholder(trimmed)) {
      if (insertedQuoteTable) {
        return;
      }
      content.push(buildQuoteItemsTableXml(quote));
      content.push(makeParagraph('', { spacingAfter: 160 }));
      insertedQuoteTable = true;
      return;
    }
    if (!insertedQuoteTable && /^1\.\s*cost of resource/i.test(trimmed)) {
      content.push(makeParagraph(trimmed, { spacingAfter: 160, font: DEFAULT_FONT, color: '334155', size: DEFAULT_FONT_SIZE }));
      content.push(buildQuoteItemsTableXml(quote));
      content.push(makeParagraph('', { spacingAfter: 160 }));
      insertedQuoteTable = true;
      return;
    }
    if (/^3\.\s*Location\s*:/i.test(trimmed)) {
      content.push(makeParagraph(`3. Location: ${location || '-'}`, { spacingAfter: 180, font: DEFAULT_FONT, color: '0F172A', size: DEFAULT_FONT_SIZE }));
      return;
    }
    content.push(makeParagraph(trimmed, { spacingAfter: 160, font: DEFAULT_FONT, color: '334155', size: DEFAULT_FONT_SIZE }));
  });

  if (regards) {
    content.push(makeParagraph('Regards,', {
      spacingBefore: 120,
      spacingAfter: 120,
      font: DEFAULT_FONT,
      color: '0F172A',
      size: DEFAULT_FONT_SIZE,
    }));
    content.push(makeParagraph(regards, {
      spacingAfter: designation ? 80 : 180,
      font: DEFAULT_FONT,
      color: '0F172A',
      size: DEFAULT_FONT_SIZE,
    }));
  }
  if (designation) {
    content.push(makeParagraph(`(${designation})`, {
      spacingAfter: 180,
      font: DEFAULT_FONT,
      color: '0F172A',
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
        <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
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
    word.folder('media').file('TeamBees.png', fs.readFileSync(logoPath));
  }
  word.folder('_rels').file('header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${hasLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/TeamBees.png"/>' : ''}
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
