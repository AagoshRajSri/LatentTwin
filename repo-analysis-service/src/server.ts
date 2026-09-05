import 'dotenv/config';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import Fastify from 'fastify';
import { analyzeRoutes } from './routes/analyze.js';

const PORT = parseInt(process.env.PORT ?? '3001');
const HOST = process.env.HOST ?? '0.0.0.0';

const server = Fastify({
  logger: {
    level: 'info',
    serializers: {
      req(req) {
        return { method: req.method, url: req.url };
      },
    },
  },
});

// Manual CORS — handles both JSON routes and streaming SSE responses
server.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin ?? '*';
  
  // Allow all origins (including vercel.app production domains)
  reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return reply.code(204).send();
  }
});

// Register routes
await server.register(analyzeRoutes);

// Health check (mirrors existing LatentTwin /api/health pattern)
server.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok', service: 'repo-analysis' });
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
