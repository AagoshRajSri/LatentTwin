/**
 * Rate Limiting Plugin for Fastify
 * Implements IP-based rate limiting
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitOptions {
  max: number; // max requests
  timeWindow: number; // time window in milliseconds
  cache?: Map<string, Array<number>>;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  max: 100,
  timeWindow: 15 * 60 * 1000, // 15 minutes
};

export async function fastifyRateLimit(
  fastify: FastifyInstance,
  opts: Partial<RateLimitOptions> = {},
) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const cache = options.cache || new Map<string, Array<number>>();

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - options.timeWindow;

    // Get or create request history for this IP
    let requests = cache.get(ip) || [];
    
    // Filter out old requests outside the time window
    requests = requests.filter((timestamp) => timestamp > windowStart);
    
    // Check if limit exceeded
    if (requests.length >= options.max) {
      const oldestRequest = Math.min(...requests);
      const resetTime = oldestRequest + options.timeWindow;
      const retryAfterMs = Math.max(0, resetTime - now);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      reply
        .header('Retry-After', retryAfterSeconds.toString())
        .header('X-RateLimit-Limit', options.max.toString())
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', (resetTime / 1000).toString())
        .code(429)
        .send({
          error: 'rate_limit_exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: retryAfterSeconds,
          limit: options.max,
          window: options.timeWindow / 1000,
        });
      
      return;
    }

    // Record this request
    requests.push(now);
    cache.set(ip, requests);

    // Add rate limit headers
    reply
      .header('X-RateLimit-Limit', options.max.toString())
      .header('X-RateLimit-Remaining', (options.max - requests.length).toString())
      .header('X-RateLimit-Reset', ((now + options.timeWindow) / 1000).toString());
  });
}

/**
 * Express-style rate limit helper for specific routes
 */
export function createRateLimiter(max: number, timeWindow: number = 15 * 60 * 1000) {
  const cache = new Map<string, Array<number>>();
  
  return async (fastify: FastifyInstance) => {
    await fastifyRateLimit(fastify, { max, timeWindow, cache });
  };
}
