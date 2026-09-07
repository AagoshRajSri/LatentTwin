/**
 * Error Handler Middleware for Express
 * Standardizes error responses across all routes
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Express error handling middleware
 * Must be registered as the last middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    statusCode: err.statusCode || 500,
    code: err.code || 'UNKNOWN_ERROR',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'validation_error',
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      message: 'Request validation failed',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    });
  }

  // Database errors
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'service_unavailable',
      code: 'DATABASE_CONNECTION_ERROR',
      statusCode: 503,
      message: 'Database connection failed. Please try again later.',
    });
  }

  // GitHub API errors
  if (err.code === 'GITHUB_API_ERROR') {
    return res.status(502).json({
      error: 'external_service_error',
      code: 'GITHUB_API_ERROR',
      statusCode: 502,
      message: err.message || 'GitHub API request failed',
      details: {
        originalError: process.env.NODE_ENV === 'development' ? err.originalError : undefined,
      },
    });
  }

  // Rate limit errors (should be caught before this, but as fallback)
  if (err.status === 429) {
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      code: 'RATE_LIMIT',
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
      retryAfter: err.retryAfter || 900,
    });
  }

  // Generic error response
  res.status(statusCode).json({
    error: code.toLowerCase().replace(/_/g, '_'),
    code,
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * Async route wrapper to catch errors in async handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
};
