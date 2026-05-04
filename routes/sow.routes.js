const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sowController = require('../controllers/sow.controller');
const validate = require('../middleware/validate');
const { createSOW, updateSOW, updateSOWStatus } = require('../validators/sow.validator');
const env = require('../config/env');

function sanitizeFilename(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
}

if (!fs.existsSync(env.uploadDir)) {
  fs.mkdirSync(env.uploadDir, { recursive: true });
}

const sowDocUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, env.uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(sanitizeFilename(file.originalname));
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.pdf' || ext === '.doc' || ext === '.docx') {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf, .doc, and .docx files are allowed'), false);
    }
  },
  limits: { fileSize: env.maxFileSize },
});

router.get('/', sowController.list);
router.get('/documents', sowController.listLinkedDocuments);
router.get('/documents/download', sowController.downloadLinkedDocument);
router.delete('/documents', sowController.deleteLinkedDocumentFolder);
router.post('/documents/upload', sowDocUpload.single('file'), sowController.uploadLinkedDocuments);
router.post('/documents/link-po', sowDocUpload.single('file'), sowController.uploadLinkedPODocument);
router.get('/:id/associations', sowController.getAssociations);
router.get('/:id', sowController.getById);
router.post('/', validate(createSOW), sowController.create);
router.post('/:id/amend', validate(updateSOW), sowController.amend);
router.put('/:id', validate(updateSOW), sowController.update);
router.patch('/:id/status', validate(updateSOWStatus), sowController.updateStatus);
router.delete('/:id', sowController.remove);

module.exports = router;
