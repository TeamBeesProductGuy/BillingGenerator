const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { supabase } = require('./config/database');
const pkg = require('./package.json');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// In production, default to same-origin unless an allowlist is configured.
const configuredOrigins = String(env.corsOrigins || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .filter((origin) => origin !== '*');

if (configuredOrigins.length > 0) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
  }));
} else if (env.nodeEnv !== 'production') {
  app.use(cors());
}

// Request logging
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.logLevel));
}

// Request size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', routes);

// Health check
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const { error } = await supabase.from('clients').select('id', { count: 'exact', head: true });
    dbStatus = error ? 'error' : 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  res.json({
    success: true,
    data: {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      version: pkg.version,
      database: dbStatus,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use(errorHandler);

module.exports = app;
