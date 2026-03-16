const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || './uploads'),
  outputDir: path.resolve(__dirname, '..', process.env.OUTPUT_DIR || './output'),
  logLevel: process.env.LOG_LEVEL || 'dev',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024,
  defaultGstPercent: parseFloat(process.env.DEFAULT_GST_PERCENT) || 18,
  corsOrigins: process.env.CORS_ORIGINS || '*',
  billingDivisor: process.env.BILLING_DIVISOR || 'actual',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
