import 'dotenv/config';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import Fastify from 'fastify';
import { analyzeRoutes } from './routes/analyze.js';
import { fastifyErrorHandler, createFastifyLogger } from './lib/errorHandler.js';
import { fastifyRateLimit } from './lib/rateLimit.js';
import openapi from '../openapi.json' with { type: 'json' };

const PORT = parseInt(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

const server = Fastify({
  logger: createFastifyLogger(),
});

// Register error handler
server.setErrorHandler(fastifyErrorHandler);

// Register rate limiting (100 requests per 15 minutes)
await fastifyRateLimit(server, {
  max: 100,
  timeWindow: 15 * 60 * 1000,
});

// Manual CORS — handles both JSON routes and streaming SSE responses
server.addHook('onRequest', async (req, reply) => {
  reply.header('Cache-Control', req.method === 'GET' ? 'no-store' : 'no-cache');
  const configuredOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'http://localhost:5173,https://latent-twin.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && configuredOrigins.includes(origin)) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
  }
  
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    if (origin && !configuredOrigins.includes(origin)) return reply.code(403).send();
    return reply.code(204).send();
  }
});

// Register routes
await server.register(analyzeRoutes);

// Keep the public API naming consistent for clients using the /api prefix.
server.register(async (api) => {
  api.register(analyzeRoutes, { prefix: '/api' });
});

// Health check (mirrors existing LatentTwin /api/health pattern)
server.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok', service: 'repo-analysis' });
});

server.get('/api/health', async (_req, reply) => {
  return reply.send({ status: 'ok', service: 'repo-analysis' });
});

server.get('/openapi.json', async (_req, reply) => {
  return reply.send(openapi);
});

// 404 fallback
server.setNotFoundHandler((_req, reply) => {
  reply.code(404).send({ error: 'not_found' });
});

// Graceful shutdown
const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await server.listen({ port: PORT, host: HOST });
  console.log(`[repo-analysis] Fastify server listening on ${HOST}:${PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
