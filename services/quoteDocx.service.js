const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '..', 'public', 'images', 'Teambees.jpeg');
const sideNoteMarker = '\n\n---SIDE_NOTE---\n';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeParagraph(text, options) {
  const style = options && options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
  const spacingAfter = options && options.spacingAfter ? `<w:spacing w:after="${options.spacingAfter}"/>` : '';
  const justify = options && options.justify ? `<w:jc w:val="${options.justify}"/>` : '';
  const bold = options && options.bold ? '<w:b/>' : '';
  const size = options && options.size ? `<w:sz w:val="${options.size}"/>` : '';
  const color = options && options.color ? `<w:color w:val="${options.color}"/>` : '';
  const italic = options && options.italic ? '<w:i/>' : '';

  return `<w:p>
    <w:pPr>${style}${spacingAfter}${justify}</w:pPr>
    <w:r>
      <w:rPr>${bold}${italic}${size}${color}</w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function makeImageParagraph() {
  return `<w:p>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0"
          xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <wp:extent cx="1828800" cy="914400"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="TeamBees Logo"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="Teambees.jpeg"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rIdLogo"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="1828800" cy="914400"/>
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

function makeTableCell(text, width, options) {
  const bold = options && options.bold ? '<w:b/>' : '';
  const justify = options && options.justify ? `<w:jc w:val="${options.justify}"/>` : '';
  const fill = options && options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '';

  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${fill}
    </w:tcPr>
    <w:p>
      <w:pPr>${justify}</w:pPr>
      <w:r>
        <w:rPr>${bold}</w:rPr>
        <w:t xml:space="preserve">${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:tc>`;
}

function makeTableRow(cells) {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

function getMailFormatNotes(notes) {
  const raw = String(notes || '');
  const markerIndex = raw.indexOf(sideNoteMarker);
  return markerIndex === -1 ? raw : raw.slice(0, markerIndex);
}

function buildQuoteDocumentXml(quote, client) {
  const items = quote.items || [];
  const mailNotes = getMailFormatNotes(quote.notes);
  const extractField = function (label) {
    const pattern = new RegExp(`^\\s*${label}\\s*:?\\s*(.+)$`, 'im');
    const match = String(mailNotes || '').match(pattern);
    return match ? match[1].trim() : '';
  };

  const subject = extractField('Subject');
  const dear = extractField('Dear');
  const location = extractField('Location');
  const regards = extractField('Regards');
  const addressLines = String((client && client.address) || '').split(/\r?\n/).filter(Boolean);

  const content = [];
  if (fs.existsSync(logoPath)) {
    content.push(makeImageParagraph());
    content.push(makeParagraph('', { spacingAfter: 220 }));
  } else {
    content.push(makeParagraph('TeamBees', { bold: true, italic: true, size: 36, color: '1F1F1F', spacingAfter: 80 }));
    content.push(makeParagraph('BUILDING ON TRUST', { size: 18, color: '6D6D6D', spacingAfter: 320 }));
  }
  content.push(makeParagraph('To,', { bold: true }));
  content.push(makeParagraph(quote.client_name || '', { bold: true }));
  addressLines.forEach(function (line) {
    content.push(makeParagraph(line));
  });
  content.push(makeParagraph('', { spacingAfter: 120 }));

  if (subject) content.push(makeParagraph(`Subject: ${subject}`, { bold: true, spacingAfter: 160 }));
  if (dear) content.push(makeParagraph(`Dear ${dear}`, { spacingAfter: 160 }));

  content.push(makeParagraph('Please refer to the following quote with best fitment to the requirements:', { spacingAfter: 120 }));
  content.push(makeParagraph('1. Cost of resource (per man month):', { bold: true, spacingAfter: 120 }));

  const tableRows = [];
  tableRows.push(makeTableRow([
    makeTableCell('S. No.', 900, { bold: true, fill: 'EDEDED', justify: 'center' }),
    makeTableCell('Description', 5400, { bold: true, fill: 'EDEDED' }),
    makeTableCell('Cost', 2200, { bold: true, fill: 'EDEDED', justify: 'right' }),
  ]));

  items.forEach(function (item, index) {
    tableRows.push(makeTableRow([
      makeTableCell(String(index + 1), 900, { justify: 'center' }),
      makeTableCell(item.description || '', 5400),
      makeTableCell(Number(item.amount || 0).toFixed(2), 2200, { justify: 'right' }),
    ]));
  });

  tableRows.push(makeTableRow([
    makeTableCell('', 900),
    makeTableCell('Total', 5400, { bold: true }),
    makeTableCell(Number(quote.total_amount || 0).toFixed(2), 2200, { bold: true, justify: 'right' }),
  ]));

  content.push(`<w:tbl>
    <w:tblPr>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="8" w:space="0" w:color="777777"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="777777"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="777777"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="777777"/>
        <w:insideH w:val="single" w:sz="8" w:space="0" w:color="777777"/>
        <w:insideV w:val="single" w:sz="8" w:space="0" w:color="777777"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="900"/>
      <w:gridCol w:w="5400"/>
      <w:gridCol w:w="2200"/>
    </w:tblGrid>
    ${tableRows.join('')}
  </w:tbl>`);

  content.push(makeParagraph('', { spacingAfter: 120 }));
  content.push(makeParagraph('2. Prevailing taxes, GST extra as applicable', { bold: true, spacingAfter: 120 }));
  content.push(makeParagraph(`3. Location: ${location}`, { bold: true, spacingAfter: 200 }));
  content.push(makeParagraph('Kindly issue the Purchase Order (PO).', { spacingAfter: 200 }));
  content.push(makeParagraph('Regards'));
  if (regards) content.push(makeParagraph(regards));

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
        <w:pgSz w:w="12240" w:h="15840"/>
        <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      </w:sectPr>
    </w:body>
  </w:document>`;
}

async function generateQuoteDocxBuffer(quote, client) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Default Extension="jpeg" ContentType="image/jpeg"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
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
  word.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
      <w:name w:val="Normal"/>
      <w:qFormat/>
      <w:rPr>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:style>
  </w:styles>`);
  if (fs.existsSync(logoPath)) {
    word.folder('media').file('Teambees.jpeg', fs.readFileSync(logoPath));
  }
  word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    ${fs.existsSync(logoPath) ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/Teambees.jpeg"/>' : ''}
  </Relationships>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { generateQuoteDocxBuffer };
