const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function getLibreOfficeCommands() {
  const configuredPath = String(process.env.LIBREOFFICE_PATH || '').trim();
  if (configuredPath) return [configuredPath];

  const candidates = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/local/bin/soffice',
    '/opt/homebrew/bin/soffice',
    'soffice',
    'libreoffice',
  ];

  return candidates.filter((candidate) => candidate === 'soffice' || candidate === 'libreoffice' || fs.existsSync(candidate));
}

function buildConversionError(message, cause) {
  const err = new Error(message);
  err.code = 'DOCX_TO_PDF_CONVERSION_FAILED';
  err.cause = cause;
  return err;
}

async function convertDocxBufferToPdf(docxBuffer, baseName) {
  if (!Buffer.isBuffer(docxBuffer) || docxBuffer.length === 0) {
    throw buildConversionError('DOCX buffer is empty');
  }

  const commands = getLibreOfficeCommands();
  if (commands.length === 0) {
    const err = new Error('LibreOffice executable was not found');
    err.code = 'DOCX_TO_PDF_UNAVAILABLE';
    throw err;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-docx-pdf-'));
  const safeBaseName = String(baseName || 'quote')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'quote';
  const docxPath = path.join(tempDir, `${safeBaseName}.docx`);
  const pdfPath = path.join(tempDir, `${safeBaseName}.pdf`);
  const libreOfficeProfile = `file://${path.join(tempDir, 'lo-profile')}`;
  const libreOfficeArgs = [
    '--headless',
    '--nologo',
    '--nodefault',
    '--nofirststartwizard',
    '--nolockcheck',
    '--norestore',
    `-env:UserInstallation=${libreOfficeProfile}`,
    '--convert-to',
    'pdf',
    '--outdir',
    tempDir,
    docxPath,
  ];

  try {
    fs.writeFileSync(docxPath, docxBuffer);
    let lastError = null;
    for (const command of commands) {
      try {
        await execFileAsync(command, libreOfficeArgs, {
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024,
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (err.code !== 'ENOENT') break;
      }
    }

    if (lastError) {
      if (lastError.code === 'ENOENT') {
        const unavailable = new Error('LibreOffice executable was not found');
        unavailable.code = 'DOCX_TO_PDF_UNAVAILABLE';
        throw unavailable;
      }
      throw lastError;
    }

    if (!fs.existsSync(pdfPath)) {
      throw buildConversionError('LibreOffice did not create the expected PDF file');
    }

    return fs.readFileSync(pdfPath);
  } catch (err) {
    if (err.code === 'DOCX_TO_PDF_UNAVAILABLE') throw err;
    if (err.code === 'ENOENT') {
      const unavailable = new Error('LibreOffice executable was not found');
      unavailable.code = 'DOCX_TO_PDF_UNAVAILABLE';
      throw unavailable;
    }
    if (err.code === 'DOCX_TO_PDF_CONVERSION_FAILED') throw err;
    throw buildConversionError('Failed to convert DOCX to PDF', err);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Temporary conversion files are best-effort cleanup only.
    }
  }
}

module.exports = { convertDocxBufferToPdf };
