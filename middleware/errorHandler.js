class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function normalizeUnexpectedError(err) {
  const rawMessage = String(err && err.message ? err.message : '').trim();
  const message = rawMessage.toLowerCase();

  if (!rawMessage) return null;

  if ((err && err.code === '23505') || message.includes('duplicate key') || message.includes('unique constraint')) {
    return new AppError(409, 'A record with the same unique value already exists.');
  }

  if (message === 'sow not found' || message === 'quote not found' || message.endsWith(' not found')) {
    return new AppError(404, rawMessage);
  }

  if (message.includes('violates row-level security')) {
    return new AppError(403, 'You do not have permission to change this record.');
  }

  if (message.includes('violates check constraint') || message.includes('invalid input syntax') || message.includes('null value in column')) {
    return new AppError(400, rawMessage);
  }

  if (
    message.includes('requires db migration') ||
    message.includes('run the supabase sql migration') ||
    message.includes('run database/migrations') ||
    message.includes('table is missing') ||
    (message.includes('column') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist'))
  ) {
    return new AppError(500, rawMessage);
  }

  return null;
}

function errorHandler(err, req, res, _next) {
  const normalizedErr = err.isOperational ? err : normalizeUnexpectedError(err);
  const statusCode = (normalizedErr && normalizedErr.statusCode) || err.statusCode || 500;
  const message = normalizedErr ? normalizedErr.message : 'Internal server error';

  if (!normalizedErr) {
    console.error('Unexpected error:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = { AppError, errorHandler };
