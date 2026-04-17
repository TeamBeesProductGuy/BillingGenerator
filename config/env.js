const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || './uploads'),
  outputDir: path.resolve(__dirname, '..', process.env.OUTPUT_DIR || './output'),
  logLevel: process.env.LOG_LEVEL || 'dev',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024,
  corsOrigins: process.env.CORS_ORIGINS || '*',
  billingDivisor: process.env.BILLING_DIVISOR || 'actual',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  msTenantId: process.env.MS_TENANT_ID,
  msClientId: process.env.MS_CLIENT_ID,
  msClientSecret: process.env.MS_CLIENT_SECRET,
  msSenderUpn: process.env.MS_SENDER_UPN,
  msGraphScope: process.env.MS_GRAPH_SCOPE || 'https://graph.microsoft.com/.default',
  reminderPrimaryRecipients: process.env.REMINDER_PRIMARY_RECIPIENTS || '',
  reminderSecondaryRecipients: process.env.REMINDER_SECONDARY_RECIPIENTS || '',
  reminderSecondaryMode: process.env.REMINDER_SECOND_EMAIL_MODE || 'cc',
  reminderSaveToSentItems: (process.env.REMINDER_SAVE_TO_SENT_ITEMS || 'true').toLowerCase() !== 'false',
  reminderFrequencyHours: parseInt(process.env.REMINDER_FREQUENCY_HOURS, 10) || 24,
  reminderSchedulerEnabled: (process.env.REMINDER_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
};
