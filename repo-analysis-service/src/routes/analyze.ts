import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import PQueue from 'p-queue';
import { AnalyzeRequestSchema, type AnalyzeRequest } from '../schemas/analyzeRequest.js';
import { createJob, getJob, jobQueue, emitProgress, finishJob, failJob } from '../lib/jobQueue.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { fetchRepo } from '../pipeline/fetchRepo.js';
import { buildGraph } from '../pipeline/buildGraph.js';
import { classifyTiers } from '../pipeline/classifyTiers.js';
import { autoScan } from '../pipeline/autoScan.js';
import { scanRepo, FULL_SCAN_CONCURRENCY } from '../pipeline/scanRepo.js';
import { assembleResult } from '../pipeline/assembleResult.js';
import { assembleFullScanResult } from '../pipeline/assembleFullScanResult.js';
import { resolveRepo } from '../lib/githubClient.js';
import { callGemini } from '../lib/geminiClient.js';

// Dedicated 1-slot queue for expensive fullScan jobs
const fullScanQueue = new PQueue({ concurrency: FULL_SCAN_CONCURRENCY });

// Premium Subscription Limits
const FREE_TIER_MAX_REPO_SIZE_KB = 50000; // 50MB
const AI_FIX_LIMIT = 2;
const AI_FIX_RESET_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory usage tracker for AI fixes: IP -> array of timestamps
const aiFixUsage = new Map<string, number[]>();

function checkAiFixLimit(ip: string): boolean {
  const now = Date.now();
  let usage = aiFixUsage.get(ip) || [];
  // Clean up expired timestamps
  usage = usage.filter(timestamp => now - timestamp < AI_FIX_RESET_MS);
  
  if (usage.length >= AI_FIX_LIMIT) {
    aiFixUsage.set(ip, usage); // update clean list
    return false; // limit exceeded
  }
  
  usage.push(now);
  aiFixUsage.set(ip, usage);
  return true;
}

export async function analyzeRoutes(fastify: FastifyInstance) {
  // POST /analyze — start a job
  fastify.post('/analyze', async (req: FastifyRequest, reply: FastifyReply) => {
    let body: AnalyzeRequest;
    try {
      body = AnalyzeRequestSchema.parse(req.body);
    } catch (err: unknown) {
      console.error('[analyze validation error]:', err, 'body:', req.body);
      const message = err instanceof Error ? err.message : 'Validation error';
      return reply.code(400).send({ error: 'validation_error', message });
    }

    const jobId = uuidv4();
    const state = createJob(jobId);

    // Queue the actual work — returns immediately
    void jobQueue.add(async () => {
      state.status = 'running';
      try {
        // 1. Resolve repo metadata + HEAD SHA for cache key
        emitProgress(state, { type: 'stage', stage: 'resolving', pct: 5 });
        const meta = await resolveRepo(body.repoUrl, body.branch, body.githubToken);

        if (meta.sizeKb > FREE_TIER_MAX_REPO_SIZE_KB) {
          failJob(state, `Premium Subscription Required: Repository exceeds the free tier limit of ${Math.round(FREE_TIER_MAX_REPO_SIZE_KB / 1024)}MB. Upgrade to analyze large-scale architectures.`);
          return;
        }

        // ── fullScan path ────────────────────────────────────────────────────────
        if (body.bugInput?.type === 'fullScan') {
          if (!process.env.GEMINI_API_KEY) {
            failJob(state, 'fullScan requires GEMINI_API_KEY to be configured. Stack-trace, description, and test-failure modes work without it.');
            return;
          }
          const cacheKey = `${meta.owner}/${meta.name}@${meta.commitSha}:fullScan`;
          const cached = cacheGet(cacheKey);
          if (cached) { finishJob(state, cached); return; }

          emitProgress(state, { type: 'stage', stage: 'cloning', pct: 10 });
          const { files } = await fetchRepo(body.repoUrl, body.branch, body.githubToken);

          emitProgress(state, { type: 'stage', stage: 'parsing_graph', pct: 30 });
          const graph = await buildGraph(files);
          emitProgress(state, { type: 'stage', stage: 'graphReady', pct: 35,
            graph: { nodes: Array.from(graph.fileSet).map(f => ({ id: f, label: f.split('/').pop() || f, file: f, tier: 'other', status: 'healthy' })), edges: graph.edges } });

          emitProgress(state, { type: 'stage', stage: 'scanning_repo', pct: 50 });
          const [tiers, scanResult] = await Promise.all([
            classifyTiers(files.map(f => f.path)).then(t => {
              emitProgress(state, { type: 'stage', stage: 'tiersReady', pct: 60, graph: { tiers: Array.from(t.entries()) } });
              return t;
            }),
            fullScanQueue.add(async () => {
              emitProgress(state, { type: 'stage', stage: 'detecting_bugs', pct: 70 });
              return scanRepo(files, graph);
            }),
          ]);

          emitProgress(state, { type: 'stage', stage: 'assembling', pct: 90 });
          const result = assembleFullScanResult(meta, files, tiers, scanResult!);
          cacheSet(cacheKey, result);
          finishJob(state, result);
          return;
        }

        // ── standard path (autoScan / stackTrace / description) ─────────────────
        const cacheKey = `${meta.owner}/${meta.name}@${meta.commitSha}`;
        const cached = cacheGet(cacheKey);
        if (cached) { finishJob(state, cached); return; }

        emitProgress(state, { type: 'stage', stage: 'cloning', pct: 10 });
        const { files } = await fetchRepo(body.repoUrl, body.branch, body.githubToken);

        emitProgress(state, { type: 'stage', stage: 'parsing_graph', pct: 40 });
        const graph = await buildGraph(files);
        emitProgress(state, { type: 'stage', stage: 'graphReady', pct: 45,
          graph: { nodes: Array.from(graph.fileSet).map(f => ({ id: f, label: f.split('/').pop() || f, file: f, tier: 'other', status: 'healthy' })), edges: graph.edges } });

        emitProgress(state, { type: 'stage', stage: 'scanning_bugs', pct: 60 });
        const [tiers, diagnosis] = await Promise.all([
          classifyTiers(files.map((f) => f.path)).then(t => {
            emitProgress(state, { type: 'stage', stage: 'tiersReady', pct: 70, graph: { tiers: Array.from(t.entries()) } });
            return t;
          }),
          (async () => {
            emitProgress(state, { type: 'stage', stage: 'detecting_bugs', pct: 75 });
            return autoScan(files, graph);
          })(),
        ]);

        emitProgress(state, { type: 'stage', stage: 'assembling', pct: 90 });
        const result = assembleResult(meta, files, graph, tiers, diagnosis);
        cacheSet(cacheKey, result);
        finishJob(state, result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        const safe = message.replace(/\b(gh[a-z_]+[A-Za-z0-9_]+|sk-ant-[^\s]+)\b/g, '[REDACTED]');
        failJob(state, safe);
      }
    });

    return reply.code(202).send({ jobId });
  });

  // GET /analyze/:jobId/events — SSE stream
  fastify.get('/analyze/:jobId/events', async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const { jobId } = req.params;
    const state = getJob(jobId);
    if (!state) return reply.code(404).send({ error: 'job_not_found' });

    // Set SSE headers (Fastify's raw response bypasses standard headers, so we set CORS manually here)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin || '*',
    });

    const send = (event: string, data: object) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // If already done/error, send final event and close immediately
    if (state.status === 'done') {
      send('done', { jobId });
      reply.raw.end();
      return;
    }
    if (state.status === 'error') {
      send('error', { message: state.error ?? 'Unknown error' });
      reply.raw.end();
      return;
    }

    const onEvent = (event: { type: string; stage?: string; pct?: number; jobId?: string; message?: string; graph?: any }) => {
      if (event.type === 'stage') {
        send('stage', { stage: event.stage, pct: event.pct, graph: event.graph });
      } else if (event.type === 'done') {
        send('done', { jobId });
      } else if (event.type === 'error') {
        send('error', { message: event.message });
      }
    };

    const onClose = () => {
      state.emitter.off('event', onEvent);
      reply.raw.end();
    };

    state.emitter.on('event', onEvent);
    state.emitter.once('close', onClose);

    // Clean up if client disconnects
    req.socket.on('close', () => {
      state.emitter.off('event', onEvent);
      state.emitter.off('close', onClose);
    });

    // Keep alive — no await (the raw response is handled by callbacks above)
  });

  // GET /analyze/:jobId/result — final JSON result
  fastify.get('/analyze/:jobId/result', async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const { jobId } = req.params;
    const state = getJob(jobId);
    if (!state) return reply.code(404).send({ error: 'job_not_found' });
    if (state.status === 'error') return reply.code(500).send({ error: 'job_failed', message: state.error });
    if (state.status !== 'done') return reply.code(202).send({ status: state.status });
    return reply.send(state.result);
  });

  // POST /ai-fix — generate an AI-powered fix for a specific buggy file
  fastify.post('/ai-fix', async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkAiFixLimit(ip)) {
      return reply.code(402).send({ 
        error: 'premium_required', 
        message: 'Premium Subscription Required: You have reached the limit of 2 AI fixes per 24 hours. Upgrade to premium for unlimited AI repairs.'
      });
    }

    const { file, bugs } = req.body as { file: string; bugs: Array<{ before?: string; after?: string; hint?: string; lineNumber?: number }> };
    if (!file || !bugs || bugs.length === 0) {
      return reply.code(400).send({ error: 'file and bugs are required' });
    }
    const bugDescriptions = bugs.map((b, i) =>
      `Bug ${i + 1} at line ${b.lineNumber ?? '?'}:\n  Before: ${b.before ?? 'unknown'}\n  Hint: ${b.hint ?? 'no hint'}`
    ).join('\n\n');

    const prompt = `You are an expert software engineer. The following bugs were detected in the file "${file}":

${bugDescriptions}

For each bug, provide:
1. The exact corrected line(s) of code
2. A brief explanation of why this fix resolves the issue
3. Whether fixing this file alone resolves the repository issue, or if other files need changes

Respond in a clear, structured format. Show the fixed code with proper context (2-3 lines before and after).`;

    try {
      const fix = await callGemini(prompt, 'You are an expert code repair assistant. Provide clear, concise, actionable fixes.');
      return reply.send({ fix });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI fix failed';
      return reply.code(500).send({ error: 'ai_fix_failed', message });
    }
  });
}
