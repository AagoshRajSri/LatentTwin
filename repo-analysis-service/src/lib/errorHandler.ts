/**
 * Error Handler for Fastify
 * Standardizes error responses across all Fastify routes
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

export class FastifyAppError extends Error {
  statusCode: number;
  code: string;
  timestamp: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Fastify error handler hook
 * Register with: fastify.setErrorHandler(errorHandler)
 */
export async function fastifyErrorHandler(
  error: Error & { statusCode?: number; code?: string; validation?: unknown },
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'An unexpected error occurred';

  request.log.error({
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    statusCode,
    code,
    message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      error: 'validation_error',
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      message: 'Request validation failed',
      details: [],
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'validation_error',
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      message: 'Request validation failed',
      details: error.validation,
    });
  }

  // GitHub API errors
  if (code === 'GITHUB_API_ERROR') {
    return reply.status(502).send({
      error: 'external_service_error',
      code: 'GITHUB_API_ERROR',
      statusCode: 502,
      message: message || 'GitHub API request failed',
    });
  }

  // Rate limit errors
  if (statusCode === 429 || code === 'RATE_LIMIT') {
    return reply.status(429).send({
      error: 'rate_limit_exceeded',
      code: 'RATE_LIMIT',
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
      retryAfter: (error as any).retryAfter || 900,
    });
  }

  // Service unavailable
  if (statusCode === 503) {
    return reply.status(503).send({
      error: 'service_unavailable',
      code,
      statusCode: 503,
      message,
    });
  }

  // Generic error response
  return reply.status(statusCode).send({
    error: code.toLowerCase().replace(/_/g, '_'),
    code,
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
}

/**
 * Structured logger setup for Fastify
 */
export const createFastifyLogger = () => {
  return {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req(req: FastifyRequest) {
        return {
          method: req.method,
          url: req.url,
          ip: req.ip,
          headers: {
            // Don't log sensitive headers
            host: req.headers.host,
          },
        };
      },
      res(res: { statusCode: number }) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  };
};
