import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { v4 as uuidv4 } from "uuid";
import PQueue from "p-queue";
import crypto from "node:crypto";
import {
  AnalyzeRequestSchema,
  GraphResultSchema,
  type AnalyzeRequest,
} from "../schemas/analyzeRequest.js";
import {
  createJob,
  getJob,
  jobQueue,
  emitProgress,
  finishJob,
  failJob,
} from "../lib/jobQueue.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { fetchRepo } from "../pipeline/fetchRepo.js";
import { buildGraph } from "../pipeline/buildGraph.js";
import { classifyTiers } from "../pipeline/classifyTiers.js";
import { autoScan } from "../pipeline/autoScan.js";
import { diagnoseBug } from "../pipeline/diagnoseBug.js";
import { scanRepo, FULL_SCAN_CONCURRENCY } from "../pipeline/scanRepo.js";
import { assembleResult } from "../pipeline/assembleResult.js";
import { assembleFullScanResult } from "../pipeline/assembleFullScanResult.js";
import { resolveRepo, fetchFileContent } from "../lib/githubClient.js";
import { callSonnet } from "../lib/geminiClient.js";

// Dedicated 1-slot queue for expensive fullScan jobs
const fullScanQueue = new PQueue({ concurrency: FULL_SCAN_CONCURRENCY });

// Premium Subscription Limits
const FREE_TIER_MAX_REPO_SIZE_KB = 50000; // 50MB
const FREE_SCAN_LIMIT = 2;
const AI_FIX_LIMIT = 2;
const AI_FIX_RESET_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory usage tracker for AI fixes: IP -> array of timestamps
const aiFixUsage = new Map<string, number[]>();
const freeScanUsage = new Map<string, Array<{ repo: string; timestamp: number }>>();

function reserveFreeScan(ip: string, repoUrl: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const repo = repoUrl.trim().toLowerCase().replace(/\.git$/, "");
  const usage = (freeScanUsage.get(ip) ?? []).filter(
    (entry) => now - entry.timestamp < AI_FIX_RESET_MS,
  );
  if (usage.some((entry) => entry.repo === repo)) {
    freeScanUsage.set(ip, usage);
    return { allowed: true, retryAfterMs: 0 };
  }
  if (usage.length >= FREE_SCAN_LIMIT) {
    freeScanUsage.set(ip, usage);
    return { allowed: false, retryAfterMs: AI_FIX_RESET_MS - (now - usage[0].timestamp) };
  }
  usage.push({ repo, timestamp: now });
  freeScanUsage.set(ip, usage);
  return { allowed: true, retryAfterMs: 0 };
}

function checkAiFixLimit(ip: string): boolean {
  const now = Date.now();
  let usage = aiFixUsage.get(ip) || [];
  // Clean up expired timestamps
  usage = usage.filter((timestamp) => now - timestamp < AI_FIX_RESET_MS);

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
  fastify.post("/analyze", async (req: FastifyRequest, reply: FastifyReply) => {
    let body: AnalyzeRequest;
    try {
      body = AnalyzeRequestSchema.parse(req.body);
    } catch (err: unknown) {
      console.error("[analyze validation error]:", err, "body:", req.body);
      const message = err instanceof Error ? err.message : "Validation error";
      return reply.code(400).send({ error: "validation_error", message });
    }

    if (body.bugInput?.type === "fullScan") {
      const quota = reserveFreeScan(req.ip || req.socket.remoteAddress || "unknown", body.repoUrl);
      if (!quota.allowed) {
        return reply
          .code(402)
          .header("Retry-After", Math.ceil(quota.retryAfterMs / 1000))
          .send({
            error: "premium_required",
            message: "The free plan includes 2 repository scans per day. Upgrade to Premium or try again tomorrow.",
            retryAfterSeconds: Math.ceil(quota.retryAfterMs / 1000),
          });
      }
    }

    const jobId = uuidv4();
    const state = createJob(jobId);

    // Queue the actual work — returns immediately
    void jobQueue.add(async () => {
      state.status = "running";
      try {
        // 1. Resolve repo metadata + HEAD SHA for cache key
        emitProgress(state, { type: "stage", stage: "resolving", pct: 5 });
        const meta = await resolveRepo(
          body.repoUrl,
          body.branch,
          body.githubToken,
        );

        if (meta.sizeKb > FREE_TIER_MAX_REPO_SIZE_KB) {
          failJob(
            state,
            `Premium Subscription Required: Repository exceeds the free tier limit of ${Math.round(FREE_TIER_MAX_REPO_SIZE_KB / 1024)}MB. Upgrade to analyze large-scale architectures.`,
          );
          return;
        }

        // ── fullScan path ────────────────────────────────────────────────────────
        if (body.bugInput?.type === "fullScan") {
          if (!process.env.GEMINI_API_KEY && !process.env.LLM7_API_KEY) {
            failJob(
              state,
              "fullScan requires GEMINI_API_KEY or LLM7_API_KEY to be configured.",
            );
            return;
          }
          const cacheKey = `${meta.owner}/${meta.name}@${meta.commitSha}:fullScan`;
          const cached = cacheGet(cacheKey);
          if (cached) {
            finishJob(state, cached);
            return;
          }

          emitProgress(state, { type: "stage", stage: "cloning", pct: 10 });
          const { files } = await fetchRepo(
            body.repoUrl,
            body.branch,
            body.githubToken,
            meta,
          );

          emitProgress(state, {
            type: "stage",
            stage: "parsing_graph",
            pct: 30,
          });
          const graph = await buildGraph(files);
          emitProgress(state, {
            type: "stage",
            stage: "graphReady",
            pct: 35,
            graph: {
              nodes: Array.from(graph.fileSet).map((f) => ({
                id: f,
                label: f.split("/").pop() || f,
                file: f,
                tier: "other",
                status: "healthy",
              })),
              edges: graph.edges,
            },
          });

          emitProgress(state, {
            type: "stage",
            stage: "scanning_repo",
            pct: 50,
          });
          const [tiers, scanResult] = await Promise.all([
            classifyTiers(files.map((f) => f.path)).then((t) => {
              emitProgress(state, {
                type: "stage",
                stage: "tiersReady",
                pct: 60,
                graph: { tiers: Array.from(t.entries()) },
              });
              return t;
            }),
            fullScanQueue.add(async () => {
              emitProgress(state, {
                type: "stage",
                stage: "detecting_bugs",
                pct: 70,
              });
              return scanRepo(files, graph);
            }),
          ]);

          emitProgress(state, { type: "stage", stage: "assembling", pct: 90 });
          const result = assembleFullScanResult(
            meta,
            files,
            tiers,
            scanResult!,
          );
          cacheSet(cacheKey, result);
          finishJob(state, GraphResultSchema.parse(result));
          return;
        }

        // ── standard path (autoScan / stackTrace / description) ─────────────────
        if (!process.env.GEMINI_API_KEY && !process.env.LLM7_API_KEY) {
          failJob(
            state,
            "AI analysis is not configured. Set GEMINI_API_KEY or LLM7_API_KEY on the analysis service.",
          );
          return;
        }
        const input = body.bugInput;
        const inputKey = input?.type === "stackTrace" || input?.type === "testFailure" || input?.type === "description"
          ? `${input.type}:${crypto.createHash("sha256").update(input.content).digest("hex")}`
          : "autoScan";
        const cacheKey = `${meta.owner}/${meta.name}@${meta.commitSha}:${inputKey}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
          finishJob(state, cached);
          return;
        }

        emitProgress(state, { type: "stage", stage: "cloning", pct: 10 });
        const { files } = await fetchRepo(
          body.repoUrl,
          body.branch,
          body.githubToken,
          meta,
        );

        emitProgress(state, { type: "stage", stage: "parsing_graph", pct: 40 });
        const graph = await buildGraph(files);
        emitProgress(state, {
          type: "stage",
          stage: "graphReady",
          pct: 45,
          graph: {
            nodes: Array.from(graph.fileSet).map((f) => ({
              id: f,
              label: f.split("/").pop() || f,
              file: f,
              tier: "other",
              status: "healthy",
            })),
            edges: graph.edges,
          },
        });

        emitProgress(state, { type: "stage", stage: "scanning_bugs", pct: 60 });
        const [tiers, diagnosis] = await Promise.all([
          classifyTiers(files.map((f) => f.path)).then((t) => {
            emitProgress(state, {
              type: "stage",
              stage: "tiersReady",
              pct: 70,
              graph: { tiers: Array.from(t.entries()) },
            });
            return t;
          }),
          (async () => {
            emitProgress(state, {
              type: "stage",
              stage: "detecting_bugs",
              pct: 75,
            });
            if (body.bugInput?.type === "stackTrace" || body.bugInput?.type === "testFailure" || body.bugInput?.type === "description") {
              return diagnoseBug(body.bugInput, files, graph);
            }
            return autoScan(files, graph);
          })(),
        ]);

        emitProgress(state, { type: "stage", stage: "assembling", pct: 90 });
        const result = assembleResult(meta, files, graph, tiers, diagnosis);
        cacheSet(cacheKey, result);
        finishJob(state, GraphResultSchema.parse(result));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Analysis failed";
        const safe = message.replace(
          /\b(gh[a-z_]+[A-Za-z0-9_]+|sk-ant-[^\s]+)\b/g,
          "[REDACTED]",
        );
        console.error("[analyze route] Job Failed:", err);
        failJob(state, safe);
      }
    });

    return reply.code(202).send({ jobId });
  });

  // GET /analyze/:jobId/events — SSE stream
  fastify.get(
    "/analyze/:jobId/events",
    async (
      req: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const { jobId } = req.params;
      const state = getJob(jobId);
      if (!state) return reply.code(404).send({ error: "job_not_found" });

      reply.hijack();

      const allowedOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "http://localhost:5173,https://latent-twin.vercel.app")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      const requestOrigin = req.headers.origin;
      if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin);
        reply.raw.setHeader("Vary", "Origin");
      }

      // Set SSE headers (Fastify's raw response bypasses standard headers, so we set CORS manually here)
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: string, data: object) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // If already done/error, send final event and close immediately
      if (state.status === "done") {
        send("done", { jobId });
        reply.raw.end();
        return;
      }
      if (state.status === "error") {
        send("job_error", { message: state.error ?? "Unknown error" });
        reply.raw.end();
        return;
      }

      const onEvent = (event: {
        type: string;
        stage?: string;
        pct?: number;
        jobId?: string;
        message?: string;
        graph?: any;
      }) => {
        if (event.type === "stage") {
          send("stage", {
            stage: event.stage,
            pct: event.pct,
            graph: event.graph,
          });
        } else if (event.type === "done") {
          send("done", { jobId });
        } else if (event.type === "job_error") {
          send("job_error", { message: event.message });
        }
      };

      const onClose = () => {
        state.emitter.off("event", onEvent);
        reply.raw.end();
      };

      state.emitter.on("event", onEvent);
      state.emitter.once("close", onClose);

      // Clean up if client disconnects
      req.socket.on("close", () => {
        state.emitter.off("event", onEvent);
        state.emitter.off("close", onClose);
      });

      // Keep alive — no await (the raw response is handled by callbacks above)
    },
  );

  // GET /analyze/:jobId/result — final JSON result
  fastify.get(
    "/analyze/:jobId/result",
    async (
      req: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const { jobId } = req.params;
      const state = getJob(jobId);
      if (!state) return reply.code(404).send({ error: "job_not_found" });
      if (state.status === "error")
        return reply
          .code(500)
          .send({ error: "job_failed", message: state.error });
      if (state.status !== "done")
        return reply.code(202).send({ status: state.status });
      return reply.send(state.result);
    },
  );

  // POST /ai-fix — generate a structured AI-powered fix for a specific buggy file
  fastify.post("/ai-fix", async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkAiFixLimit(ip)) {
      return reply.code(402).send({
        error: "premium_required",
        message:
          "Premium Subscription Required: You have reached the limit of 2 AI fixes per 24 hours. Upgrade to premium for unlimited AI repairs.",
      });
    }

    const body = req.body as {
      file: string;
      originalContent?: string;
      repoUrl?: string;
      branch?: string;
      githubToken?: string;
      bugs: Array<{
        before?: string;
        after?: string;
        hint?: string;
        lineNumber?: number;
      }>;
    };
    let { file, bugs, originalContent, repoUrl, branch, githubToken } = body;

    if (!file || !bugs || bugs.length === 0) {
      return reply.code(400).send({ error: "file and bugs are required" });
    }

    // If originalContent is missing, try to fetch it
    if (!originalContent && repoUrl) {
      try {
        const meta = await resolveRepo(repoUrl, branch, githubToken);
        const content = await fetchFileContent(meta.owner, meta.name, file, meta.commitSha, githubToken);
        if (content) originalContent = content;
      } catch (err: any) {
        console.warn("[ai-fix] Failed to fetch original content:", err.message);
      }
    }

    const bugDescriptions = bugs
      .map(
        (b, i) =>
          `Bug ${i + 1} at line ${b.lineNumber ?? "?"}:\n  Buggy line: ${b.before ?? "unknown"}\n  Suggested fix: ${b.after ?? "unknown"}\n  Hint: ${b.hint ?? "no hint"}`,
      )
      .join("\n\n");

    const systemPrompt = `You are an expert software engineer and code repair specialist.
Your task is to produce a complete, production-ready fixed version of a source file.
You MUST respond with a single valid JSON object only — no prose, no markdown fences.
The JSON must exactly match this schema:
{
  "rootCause": "Plain English explanation of WHY the original code is wrong and what the real-world impact is",
  "fixRationale": "Plain English explanation of WHY the proposed fix is correct and production-safe",
  "fullFixedContent": "The complete fixed file content as a single string with \\n newlines",
  "hunks": [
    {
      "lineNumber": 42,
      "original": "the exact original line",
      "fixed": "the corrected replacement line",
      "explanation": "one-line explanation of this specific change"
    }
  ]
}
CRITICAL: fullFixedContent must be the entire file with ALL bugs fixed. Do not truncate it.`;

    const fileSection = originalContent
      ? `\n\nOriginal file content:\n\`\`\`\n${originalContent}\n\`\`\``
      : "";

    const prompt = `Fix all bugs in the file "${file}".

Detected bugs:
${bugDescriptions}
${fileSection}

Produce the complete fixed file content and a structured diff of exactly what changed.`;

    try {
      const raw = await callSonnet(prompt, systemPrompt);

      // Attempt to parse structured JSON response
      let structured: {
        rootCause: string;
        fixRationale: string;
        fullFixedContent: string;
        hunks: Array<{ lineNumber: number; original: string; fixed: string; explanation: string }>;
      } | null = null;

      try {
        // Strip potential markdown fences
        const cleaned = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();
        structured = JSON.parse(cleaned);
      } catch {
        // Fallback: return unstructured fix for backwards-compat
        return reply.send({ fix: raw });
      }

      // Compute a simple line-level diff if fullFixedContent and originalContent are both available
      let diffHunks: Array<{
        lineNumber: number;
        type: "removed" | "added" | "context";
        content: string;
        explanation?: string;
      }> = [];

      if (originalContent && structured?.fullFixedContent) {
        const origLines = originalContent.split("\n");
        const fixedLines = structured.fullFixedContent.split("\n");

        const maxLines = Math.max(origLines.length, fixedLines.length);
        let contextBefore: number[] = [];

        for (let i = 0; i < maxLines; i++) {
          const orig = origLines[i] ?? null;
          const fixed = fixedLines[i] ?? null;

          if (orig !== fixed) {
            // Include up to 3 lines of context before this change
            const ctxStart = Math.max(0, i - 3);
            for (let c = ctxStart; c < i; c++) {
              if (!contextBefore.includes(c) && origLines[c] === fixedLines[c]) {
                diffHunks.push({ lineNumber: c + 1, type: "context", content: origLines[c] });
                contextBefore.push(c);
              }
            }
            if (orig !== null) diffHunks.push({ lineNumber: i + 1, type: "removed", content: orig });
            if (fixed !== null) diffHunks.push({ lineNumber: i + 1, type: "added", content: fixed });
          }
        }
      }

      return reply.send({
        fix: structured ? `${structured.rootCause}\n\n${structured.fixRationale}` : raw,
        rootCause: structured?.rootCause ?? null,
        fixRationale: structured?.fixRationale ?? null,
        fullOriginalFile: originalContent ?? null,
        fullFixedFile: structured?.fullFixedContent ?? null,
        diffHunks: diffHunks.length > 0 ? diffHunks : null,
        hunks: structured?.hunks ?? null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "AI fix failed";
      return reply.code(500).send({ error: "ai_fix_failed", message });
    }
  });

  // POST /verify-fix — run Semgrep on a patched file to confirm zero findings
  fastify.post("/verify-fix", async (req: FastifyRequest, reply: FastifyReply) => {
    const { file, content } = req.body as { file: string; content: string };

    if (!file || typeof content !== "string") {
      return reply.code(400).send({ error: "file and content are required" });
    }

    const { runSemgrepOnContent } = await import("../pipeline/scanRepo.js");
    try {
      const results = await runSemgrepOnContent(file, content);
      return reply.send({
        clean: results.length === 0,
        remainingIssues: results,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification failed";
      return reply.code(500).send({ error: "verify_failed", message });
    }
  });
}
