/**
 * scanRepo.ts — fullScan pipeline
 *
 * Two-model approach:
 *  1. Gemini Flash: broad sweep across batched repo files → surface candidate bug files
 *  2. Existing diagnoseFile (via re-export from diagnoseBug.ts) → precise before/after/hint
 *
 * Produces a blast-radius subgraph with three distinct statuses:
 *   "impacted"             — the buggy file itself
 *   "affected-downstream"  — files that import the buggy file (will break because of the bug)
 *   "context"              — files the buggy file imports (relevant context, not broken)
 */

import path from "node:path";
import PQueue from "p-queue";
import { callGemini, callSonnet, FLASH_MODEL } from "../lib/geminiClient.js";
import type { FetchedFile } from "./fetchRepo.js";
import type { FileGraph } from "./buildGraph.js";
import {
  DiagnosedLineSchema,
  type DiagnosedLine,
} from "../schemas/analyzeRequest.js";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ScanCandidate {
  file: string;
  lineHint?: number;
  reason: string;
  confidence: number; // 0–1, Gemini's stated confidence or heuristic fallback
}

export interface NodeBlast {
  file: string;
  status: "healthy" | "impacted" | "affected-downstream" | "context";
  role: string;
  lines: DiagnosedLine[];
}

export interface FullScanResult {
  /** All nodes in the blast radius — buggy file + direct neighbors only */
  blastRadius: NodeBlast[];
  /** Edges within the blast radius (subset of the full graph) */
  edges: Array<{ source: string; target: string }>;
}

// ────────────────────────────────────────────────────────────
// Config / helpers
// ────────────────────────────────────────────────────────────

const SCANNABLE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".cs",
  ".cpp",
  ".c",
  ".rs",
]);

/** Approx characters per token — conservative for Gemini Flash */
const CHARS_PER_TOKEN = 4;
/** Leave a generous margin for prompt overhead + response */
const MAX_CONTEXT_TOKENS = 80_000;
const MAX_BATCH_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;

/** Files to prioritize in batching — src/lib take precedence over tests/vendor */
const PRIORITY_DIRS = ["src/", "lib/", "app/", "core/", "server/", "client/"];
const LOW_PRIORITY_PATTERNS = [
  "test",
  "spec",
  "__test__",
  "vendor",
  "dist/",
  "build/",
  ".min.",
  "node_modules",
];
const TOP_CANDIDATES_CAP = 3;
// Only 1 fullScan job in flight at a time — it's expensive
export const FULL_SCAN_CONCURRENCY = 1;

function isScannableFile(f: FetchedFile): boolean {
  const ext = path.extname(f.path).toLowerCase();
  return (
    SCANNABLE_EXTS.has(ext) &&
    !LOW_PRIORITY_PATTERNS.some((p) => f.path.includes(p)) &&
    f.content.trim().length > 0
  );
}

function filePriority(filePath: string): number {
  if (PRIORITY_DIRS.some((d) => filePath.startsWith(d))) return 0;
  return 1;
}

function batchFiles(files: FetchedFile[]): FetchedFile[][] {
  const sorted = [...files]
    .filter(isScannableFile)
    .sort((a, b) => filePriority(a.path) - filePriority(b.path));

  const batches: FetchedFile[][] = [];
  let current: FetchedFile[] = [];
  let currentChars = 0;

  for (const file of sorted) {
    const lines = file.content.split("\n");
    let chunkLines: string[] = [];
    let chunkChars = 0;
    const flushChunk = () => {
      if (chunkLines.length === 0) return;
      const chunk = chunkLines.join("\n");
      const chars = chunk.length + file.path.length + 20;
      if (currentChars + chars > MAX_BATCH_CHARS && current.length > 0) {
        batches.push(current);
        current = [];
        currentChars = 0;
      }
      current.push({ ...file, content: chunk });
      currentChars += chars;
      chunkLines = [];
      chunkChars = 0;
    };
    for (const line of lines) {
      if (
        chunkLines.length > 0 &&
        chunkChars + line.length + 1 > MAX_BATCH_CHARS
      ) {
        flushChunk();
      }
      chunkLines.push(line);
      chunkChars += line.length + 1;
    }
    flushChunk();
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ────────────────────────────────────────────────────────────
// Stage 1: Gemini broad sweep
// ────────────────────────────────────────────────────────────

const SWEEP_SYSTEM = `You are a strict, expert static analysis engine inspecting code for functional, architectural, and React bugs.
Respond with a JSON array ONLY — no prose, no markdown fences, no explanations.
Each item in the array must be:
{"file": string, "lineHint": number|null, "reason": string, "confidence": number}

- "file": exact path as it appears in the code listing header (e.g. "src/App.jsx")
- "lineHint": line number of the bug, or null if unknown
- "reason": concise explanation of the bug (e.g., "missing useEffect dependency array causing infinite re-renders", "direct state mutation using push()", "Math.random() used for React key or ID generation", "deprecated defaultProps on function component")
- "confidence": number between 0.7 and 1.0

CRITICAL RULES:
1. Scan EVERY file completely and report ALL suspected bugs. If multiple files have bugs, report all of them. Err on the side of reporting more bugs rather than missing them.
2. React Hooks: Look for missing dependency arrays in useEffect, useCallback, and useMemo. Also look for state mutations inside hooks.
3. Immutability: Look for direct mutations of React state and objects (e.g. using .push(), .splice(), .pop(), or direct property assignment instead of setter functions or spread operator).
4. Deprecated APIs: Look for React 19 deprecations, including defaultProps on function components.
5. Unique Keys: Look for non-unique React keys or unsafe ID generation. CRITICAL: If you see Math.random() anywhere being used for keys, IDs, or unique identifiers, report it as a high-confidence bug (0.95+).
6. General Anti-Patterns: Look for index-based keys in lists, missing null checks, unhandled promises, async operations without await, infinite loops, and state that should be refs.`;

async function sweepBatch(batch: FetchedFile[]): Promise<ScanCandidate[]> {
  const fileDumps = batch
    .map((f) => `// FILE: ${f.path}\n${f.content}`)
    .join("\n\n// ─────────────────────────────────\n\n");

  const prompt = `Scan these ${batch.length} source files for real bugs:\n\n${fileDumps}\n\nReturn a JSON array of bugs found.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGemini(
        attempt === 0
          ? prompt
          : `${prompt}\n\n(Previous attempt produced invalid JSON. Return ONLY a valid JSON array.)`,
        SWEEP_SYSTEM,
        FLASH_MODEL,
      );
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn(
          `[sweepBatch] Gemini returned non-array on attempt ${attempt + 1}:`,
          raw.slice(0, 200),
        );
        continue;
      }
      const hits = (parsed as any[])
        .filter(
          (c) => typeof c.file === "string" && typeof c.reason === "string",
        )
        .map((c) => ({
          file: c.file as string,
          lineHint: typeof c.lineHint === "number" ? c.lineHint : undefined,
          reason: c.reason as string,
          confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
        }));
      console.log(
        `[sweepBatch] Attempt ${attempt + 1}: Gemini returned ${hits.length} candidates`,
      );
      return hits;
    } catch (err) {
      console.error(
        `[sweepBatch] Attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempt === 1) {
        console.error(
          "[sweepBatch] Both attempts failed — returning empty for this batch.",
        );
      }
    }
  }
  return [];
}

// ────────────────────────────────────────────────────────────
// Stage 2: precise diagnosis (re-uses diagnoseBug's diagnoseFile logic)
// ────────────────────────────────────────────────────────────

const PRECISE_SYSTEM = `You are an expert code analysis assistant performing a full-file audit.
Respond with a JSON array only — no prose, no markdown fences.
Each element must match: {"id": string, "lineNumber": number, "before": string, "after": string, "hint": string, "error": true, "role": string}
- "before": the exact buggy line as it appears in the source
- "after": the corrected replacement line
- "hint": concise explanation of why this is a bug and its impact
- "role": ≤8-word label for this file's role in the bug (e.g. "root cause — Math.random() for ID generation")
Find EVERY genuine bug in the entire file. Do not limit to just the suspected area. If no bugs exist, return an empty array.
STRICT: You must report bugs that actually exist in the code. Do not fabricate bugs, but do not miss real ones either.`;

async function diagnoseCandidate(
  file: string,
  lineHint: number | undefined,
  reason: string,
  content: string,
): Promise<{ lines: DiagnosedLine[]; role: string }> {
  const prompt = `File: ${file}
Known bug area: ${lineHint ? `around line ${lineHint}` : "unknown"}
Initial suspected bug: ${reason}

Full file source:
\`\`\`
${content}
\`\`\`

Find ALL genuine bugs in this file (not just the suspected one). For each bug, return the exact broken line, its fix, a hint, and a role label.
Return [] only if the file is genuinely clean.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callSonnet(
        attempt === 0
          ? prompt
          : `${prompt}\n\n(Return ONLY a valid JSON array, nothing else.)`,
        PRECISE_SYSTEM,
      );
      const parsed: any[] = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.log(
          `[diagnoseCandidate] ${file}: Gemini returned empty/non-array — treating as clean`,
        );
        break;
      }

      const role: string = parsed[0]?.role ?? "root cause";
      const diagLines: DiagnosedLine[] = parsed.flatMap(
        (l: unknown, i: number) => {
          const checked = DiagnosedLineSchema.safeParse({
            ...(typeof l === "object" && l !== null ? l : {}),
            id: (l as any)?.id ?? `${file.replace(/\W/g, "_")}_${i}`,
            error: true,
          });
          return checked.success ? [checked.data] : [];
        },
      );
      console.log(
        `[diagnoseCandidate] ${file}: found ${diagLines.length} diagnosed lines, role: "${role}"`,
      );
      return { lines: diagLines, role };
    } catch (err) {
      console.error(
        `[diagnoseCandidate] Attempt ${attempt + 1} failed for ${file}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.warn(
    `[diagnoseCandidate] ${file}: all attempts failed — returning empty lines`,
  );
  return { lines: [], role: "root cause" };
}

// ────────────────────────────────────────────────────────────
// Stage 3: blast-radius subgraph
// ────────────────────────────────────────────────────────────

function computeBlastRadius(
  buggyFiles: string[],
  graph: FileGraph,
  diagnosedMap: Map<string, { lines: DiagnosedLine[]; role: string }>,
): {
  blastRadius: NodeBlast[];
  edges: Array<{ source: string; target: string }>;
} {
  const buggySet = new Set(buggyFiles);

  // Direct incoming: files that import one of the buggy files (will break)
  const downstream = new Map<string, string>(); // file → which buggy file it calls
  // Direct outgoing: files the buggy file imports (context)
  const context = new Map<string, string>(); // file → which buggy file imports it

  for (const edge of graph.edges) {
    if (buggySet.has(edge.target) && !buggySet.has(edge.source)) {
      downstream.set(edge.source, edge.target);
    }
    if (buggySet.has(edge.source) && !buggySet.has(edge.target)) {
      context.set(edge.target, edge.source);
    }
  }

  const blastRadius: NodeBlast[] = [];

  // The buggy files themselves
  for (const file of buggyFiles) {
    const diag = diagnosedMap.get(file);
    blastRadius.push({
      file,
      status: "impacted",
      role: diag?.role ?? "root cause",
      lines: diag?.lines ?? [],
    });
  }

  // Downstream (callers that will break)
  for (const [file, calledBuggy] of downstream) {
    const basename = path.basename(calledBuggy);
    blastRadius.push({
      file,
      status: "affected-downstream",
      role: `calls ${basename}`,
      lines: [],
    });
  }

  // Context (dependencies the buggy file relies on)
  for (const [file, buggyImporter] of context) {
    const basename = path.basename(buggyImporter);
    blastRadius.push({
      file,
      status: "context",
      role: `imported by ${basename}`,
      lines: [],
    });
  }

  // Edges strictly within the blast radius
  const blastSet = new Set(blastRadius.map((n) => n.file));
  const edges = graph.edges.filter(
    (e) => blastSet.has(e.source) && blastSet.has(e.target),
  );

  return { blastRadius, edges };
}

// ────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────

export async function scanRepo(
  files: FetchedFile[],
  graph: FileGraph,
): Promise<FullScanResult> {
  if (!process.env.GEMINI_API_KEY && !process.env.LLM7_API_KEY) {
    throw new Error(
      "fullScan requires GEMINI_API_KEY or LLM7_API_KEY to be configured.",
    );
  }

  const fileMap = new Map(files.map((f) => [f.path, f.content]));

  // ── Stage 1: batch sweep ──────────────────────────────────
  const batches = batchFiles(files);
  console.log(
    `[scanRepo] Stage 1: ${files.length} total files, ${batches.length} batches to sweep`,
  );
  const allCandidates: ScanCandidate[] = [];

  // Run batches sequentially to respect cost/rate limits
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(
      `[scanRepo] Sweeping batch ${bi + 1}/${batches.length} (${batch.length} files)`,
    );
    const found = await sweepBatch(batch);
    console.log(
      `[scanRepo] Batch ${bi + 1} found ${found.length} candidates:`,
      found.map((c) => `${c.file} (${c.confidence})`),
    );
    allCandidates.push(...found);
  }

  console.log(`[scanRepo] Total raw candidates: ${allCandidates.length}`);

  // Fallback: if AI found nothing, run simple heuristic scan
  if (allCandidates.length === 0) {
    console.warn("[scanRepo] Gemini returned 0 candidates. Running heuristic fallback scan...");
    
    // Simple heuristic: look for Math.random used in map/render, push() on state, missing dependency arrays
    const heuristics: ScanCandidate[] = [];
    
    for (const file of files.filter(isScannableFile)) {
      const content = file.content;
      
      // Heuristic 1: Math.random() used for keys in JSX renders
      // Pattern: Math.random() inside map() or used directly as key attribute
      if (/\.map\([^)]*\([^)]*\)[^}]*Math\.random|key\s*=\s*\{?\s*Math\.random/.test(content)) {
        heuristics.push({
          file: file.path,
          lineHint: undefined,
          reason: "Math.random() used for React key generation in map/render (causes key collisions and reconciliation bugs)",
          confidence: 0.90,
        });
      }
      
      // Heuristic 2: Direct array mutations (.push, .pop, .splice) on state
      if (/setState|\.setState|const\s+\w+\s*=\s*\[\s*\.\.\.|this\.state|\[\s*\.\.\.\w+.*\]\.push\(/.test(content) &&
          /\.push\(|\.pop\(|\.splice\(|\.shift\(|\.unshift\(/.test(content)) {
        heuristics.push({
          file: file.path,
          lineHint: undefined,
          reason: "Direct array mutation (.push, .pop, .splice) on state array (breaks React re-render detection)",
          confidence: 0.85,
        });
      }
      
      // Heuristic 3: useEffect without dependency array (or empty deps on side-effecting hooks)
      if (/useEffect\(\s*\(\s*\)\s*=>\s*\{/i.test(content) && !/useEffect\([^,]*,[^)]*\]/i.test(content)) {
        heuristics.push({
          file: file.path,
          lineHint: undefined,
          reason: "useEffect hook without dependency array (causes infinite loops or missing re-runs)",
          confidence: 0.80,
        });
      }
    }
    
    if (heuristics.length > 0) {
      console.log(`[scanRepo] Heuristic scan found ${heuristics.length} candidates:`, 
        heuristics.map((c) => `${c.file} (${c.confidence})`));
      allCandidates.push(...heuristics);
    } else {
      console.warn(
        "[scanRepo] Both AI and heuristic scans returned 0 bugs. Repository appears clean or all bugs are too subtle for detection.",
      );
      const visibleFiles = files.filter((file) => graph.fileSet.has(file.path));
      return {
        blastRadius: visibleFiles.map((file) => ({
          file: file.path,
          status: "healthy",
          role: "healthy repository file",
          lines: [],
        })),
        edges: graph.edges,
      };
    }
  }

  // Rank: by confidence first, then by graph in-degree as tiebreaker
  const inDegree = new Map<string, number>();
  for (const edge of graph.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const ranked = [...allCandidates]
    .filter((c) => {
      // Validate that the file actually exists in our fetched set
      const exists =
        fileMap.has(c.file) ||
        [...fileMap.keys()].some((k) => k.endsWith(c.file));
      if (!exists)
        console.warn(
          `[scanRepo] Candidate file not found in fileMap: "${c.file}" — sample keys:`,
          [...fileMap.keys()].slice(0, 5),
        );
      return exists;
    })
    .sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (Math.abs(confDiff) > 0.05) return confDiff;
      return (inDegree.get(b.file) ?? 0) - (inDegree.get(a.file) ?? 0);
    });

  console.log(
    `[scanRepo] Ranked after path validation: ${ranked.length} candidates`,
  );

  // Resolve file paths (Gemini may return basename or partial path)
  function resolveFile(candidate: string): string | null {
    if (fileMap.has(candidate)) return candidate;
    const match = [...fileMap.keys()].find(
      (k) => k.endsWith(candidate) || k.endsWith("/" + candidate),
    );
    return match ?? null;
  }

  const top = ranked
    .slice(0, TOP_CANDIDATES_CAP)
    .map((c) => ({ ...c, file: resolveFile(c.file) ?? c.file }))
    .filter((c) => fileMap.has(c.file));

  console.log(
    `[scanRepo] Top candidates after resolution (cap=${TOP_CANDIDATES_CAP}):`,
    top.map((c) => c.file),
  );

  if (top.length === 0) {
    throw new Error(
      "Analysis failed: Model returned file paths that do not match fetched files.",
    );
  }

  // ── Stage 2: precise diagnosis ────────────────────────────
  const DIAG_CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY ?? "3");
  const diagQueue = new PQueue({ concurrency: DIAG_CONCURRENCY });
  const diagnosedMap = new Map<
    string,
    { lines: DiagnosedLine[]; role: string }
  >();

  await Promise.all(
    top.map((candidate) =>
      diagQueue.add(async () => {
        const content = fileMap.get(candidate.file);
        if (!content) return;
        const result = await diagnoseCandidate(
          candidate.file,
          candidate.lineHint,
          candidate.reason,
          content,
        );
        if (result.lines.length > 0) {
          diagnosedMap.set(candidate.file, result);
        }
      }),
    ),
  );

  // ── Stage 3: blast radius ─────────────────────────────────
  const buggyFiles = [...diagnosedMap.keys()];
  if (buggyFiles.length === 0) {
    const visibleFiles = files.filter((file) => graph.fileSet.has(file.path));
    return {
      blastRadius: visibleFiles.map((file) => ({
        file: file.path,
        status: "healthy",
        role: "unconfirmed candidate",
        lines: [],
      })),
      edges: graph.edges,
    };
  }
  return computeBlastRadius(buggyFiles, graph, diagnosedMap);
}
