import PQueue from 'p-queue';
import { callSonnet } from '../lib/geminiClient.js';
import type { FetchedFile } from './fetchRepo.js';
import type { FileGraph } from './buildGraph.js';
import type { DiagnosedLine } from '../schemas/analyzeRequest.js';

export interface AutoScanResult {
  impactedFiles: Set<string>;
  linesByFile: Map<string, DiagnosedLine[]>;
}

// File extensions worth scanning for logic bugs
const SCANNABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb', '.cs', '.cpp', '.c', '.rs',
]);

// Max lines to send per file to avoid token overflow
const MAX_LINES_PER_FILE = 120;

const SCAN_SYSTEM = `You are an expert code bug detector.
Respond with a JSON array only — no prose, no markdown fences, no explanation.
If the file has NO bugs, respond with an empty array: []
Each bug must match exactly: {"id": string, "lineNumber": number, "before": string, "after": string, "hint": string, "error": true}
- "before": the exact buggy line of code as it appears
- "after": the corrected line of code
- "hint": a concise description of the bug and why it matters
Focus ONLY on genuine bugs: logic errors, state mutations, race conditions, missing dependencies, type mismatches, null dereferences, security issues.
Do NOT report style issues, naming conventions, or missing comments.`;

async function scanFile(file: FetchedFile): Promise<DiagnosedLine[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const lines = file.content.split('\n');
  const snippet = lines.slice(0, MAX_LINES_PER_FILE).join('\n');

  const prompt = `File: ${file.path}

\`\`\`
${snippet}
\`\`\`

Find all genuine bugs in this file. Return [] if the file is clean.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callSonnet(
        attempt === 0 ? prompt : `${prompt}\n\n(Previous attempt produced invalid JSON. Return ONLY a valid JSON array, nothing else.)`,
        SCAN_SYSTEM
      );

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((l: any, i: number) => ({
          ...l,
          id: l.id ?? `${file.path.replace(/\W/g, '_')}_${i}`,
          error: true,
        }));
      }
      return null; // empty array = clean file
    } catch (err) {
      console.error(`[autoScan] Error scanning ${file.path} (attempt ${attempt + 1}):`, err);
    }
  }
  return null;
}

export async function autoScan(
  files: FetchedFile[],
  graph: FileGraph
): Promise<AutoScanResult> {
  const LLM_CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY ?? '5');
  const queue = new PQueue({ concurrency: LLM_CONCURRENCY });
  const linesByFile = new Map<string, DiagnosedLine[]>();

  // Only scan source files, skip assets, configs, lock files etc.
  const scannable = files.filter(f => {
    const ext = f.path.slice(f.path.lastIndexOf('.')).toLowerCase();
    const base = f.path.split('/').pop() ?? '';
    return (
      SCANNABLE_EXTS.has(ext) &&
      !base.startsWith('.') &&
      !f.path.includes('node_modules') &&
      !f.path.includes('.min.') &&
      !f.path.includes('dist/') &&
      !f.path.includes('build/') &&
      f.content.trim().length > 0
    );
  });

  await Promise.all(
    scannable.map(file =>
      queue.add(async () => {
        const bugs = await scanFile(file);
        if (bugs) linesByFile.set(file.path, bugs);
      })
    )
  );

  // Walk graph 1-hop from buggy files to mark impacted neighbors
  const diagnosed = new Set(linesByFile.keys());
  const impactedFiles = new Set(diagnosed);
  for (const f of diagnosed) {
    for (const edge of graph.edges) {
      if (edge.source === f) impactedFiles.add(edge.target);
      if (edge.target === f) impactedFiles.add(edge.source);
    }
  }

  return { impactedFiles, linesByFile };
}
