import PQueue from 'p-queue';
import { callSonnet } from '../lib/geminiClient.js';
import type { BugInput } from '../schemas/analyzeRequest.js';
import type { FetchedFile } from './fetchRepo.js';
import type { FileGraph } from './buildGraph.js';
import type { DiagnosedLine } from '../schemas/analyzeRequest.js';

export interface BugLocation {
  file: string;
  lineNumber?: number;
}

export interface DiagnosisResult {
  impactedFiles: Set<string>;
  linesByFile: Map<string, DiagnosedLine[]>;
}

export async function diagnoseBug(
  bugInput: BugInput,
  files: FetchedFile[],
  graph: FileGraph
): Promise<DiagnosisResult> {
  const fileMap = new Map(files.map((f) => [f.path, f.content]));

  // Step 1: Find candidate files from the bug input
  let candidates: BugLocation[] = [];
  if (bugInput.type === 'stackTrace' || bugInput.type === 'testFailure') {
    candidates = parseStackTrace(bugInput.content, graph.fileSet);
  } else {
    candidates = await descriptionToFiles(bugInput.content, [...graph.fileSet]);
  }

  if (candidates.length === 0) {
    return { impactedFiles: new Set(), linesByFile: new Map() };
  }

  // Step 2: For each candidate, fetch content and ask Gemini for structured diagnosis
  const LLM_CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY ?? '5');
  const queue = new PQueue({ concurrency: LLM_CONCURRENCY });
  const linesByFile = new Map<string, DiagnosedLine[]>();

  await Promise.all(
    candidates.map((loc) =>
      queue.add(async () => {
        const content = fileMap.get(loc.file);
        if (!content) return;
        const diagnosed = await diagnoseFile(loc, content, bugInput.content);
        if (diagnosed) linesByFile.set(loc.file, diagnosed);
      })
    )
  );

  // Step 3: Walk graph 1-2 hops from diagnosed files to mark impacted neighbors
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

function parseStackTrace(content: string, fileSet: Set<string>): BugLocation[] {
  const results: BugLocation[] = [];
  // Matches: "at Something (path/to/file.ts:14:5)"  OR  "File: path/to/file.py, line 14"
  const patterns = [
    /(?:at\s+\S+\s+\()?([\w./\\-]+\.[jt]sx?|[\w./\\-]+\.py):(\d+)/g,
    /in ([\w./\\-]+\.[jt]sx?|[\w./\\-]+\.py).*?line (\d+)/g,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const [, rawPath, line] = m as unknown as [string, string, string];
      // Strip leading ./ and normalize separators
      const norm = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
      // Find in our file set (partial suffix match)
      const match = [...fileSet].find((f) => f.endsWith(norm) || f === norm);
      if (match) {
        results.push({ file: match, lineNumber: parseInt(line) });
      }
    }
  }

  return dedupe(results);
}

async function descriptionToFiles(description: string, filePaths: string[]): Promise<BugLocation[]> {
  if (!process.env.GEMINI_API_KEY) return [];
  const sample = filePaths.slice(0, 300).join('\n');
  const prompt = `Repository file listing (partial):
${sample}

Bug description:
${description}

Return a JSON array of up to 5 likely files involved in this bug, with estimated line numbers if known.
Format: [{"file": "path/to/file.ts", "lineNumber": 14}]`;

  try {
    const raw = await callSonnet(prompt);
    console.log('descriptionToFiles raw:', raw);
    const parsed: Array<{ file: string; lineNumber?: number }> = JSON.parse(raw);
    return parsed.map((p) => ({ file: p.file, lineNumber: p.lineNumber }));
  } catch (err) {
    console.error('Error in descriptionToFiles:', err);
    return [];
  }
}

const STRUCTURED_SYSTEM = `You are a precise code analysis assistant.
Respond with a JSON array only — no prose, no markdown fences.
Each element must match: {"id": string, "lineNumber": number, "before": string, "after": string, "hint": string, "error": true}`;

async function diagnoseFile(
  loc: BugLocation,
  content: string,
  bugContext: string
): Promise<DiagnosedLine[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  // Send relevant surrounding context (up to 60 lines around the suspect line)
  let snippet = content;
  if (loc.lineNumber) {
    const lines = content.split('\n');
    const start = Math.max(0, loc.lineNumber - 30);
    const end = Math.min(lines.length, loc.lineNumber + 30);
    snippet = lines.slice(start, end).join('\n');
  }

  const prompt = `File: ${loc.file}${loc.lineNumber ? ` (around line ${loc.lineNumber})` : ''}

Code snippet:
\`\`\`
${snippet}
\`\`\`

Bug context: ${bugContext}

Identify the specific broken lines in this file and produce a repair for each.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callSonnet(
        attempt === 0 ? prompt : `${prompt}\n\n(Previous attempt produced invalid JSON. Return only a valid JSON array.)`,
        STRUCTURED_SYSTEM
      );
      console.log('diagnoseFile raw attempt', attempt, ':', raw);
      const parsed: DiagnosedLine[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((l, i) => ({
          ...l,
          id: l.id ?? `${loc.file.replace(/\W/g, '_')}_${i}`,
          error: true,
        }));
      }
    } catch (err) {
      console.error(`[diagnoseBug] Error diagnosing ${loc.file} (attempt ${attempt + 1}):`, err);
    }
  }

  return null;
}

function dedupe(locs: BugLocation[]): BugLocation[] {
  const seen = new Set<string>();
  return locs.filter((l) => {
    const k = l.file;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
