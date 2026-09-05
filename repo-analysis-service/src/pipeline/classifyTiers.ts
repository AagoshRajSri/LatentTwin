import path from 'node:path';
import PQueue from 'p-queue';
import { callHaiku } from '../lib/geminiClient.js';

export type Tier = 'api' | 'logic' | 'data' | 'other';

const TIER_PATTERNS: Array<{ pattern: RegExp; tier: Tier }> = [
  { pattern: /^(routes?|api|endpoints?|handlers?|controllers?)\//i, tier: 'api' },
  { pattern: /controller|handler|service|usecase|interactor/i, tier: 'logic' },
  { pattern: /^(models?|schemas?|entities|db|database|migrations?|repositories?)\//i, tier: 'data' },
  { pattern: /(model|schema|entity|repository|dao|orm)\.(ts|js|py)$/i, tier: 'data' },
];

export function classifyByConvention(filePath: string): Tier | null {
  const lower = filePath.toLowerCase();
  for (const { pattern, tier } of TIER_PATTERNS) {
    if (pattern.test(lower)) return tier;
  }
  return null;
}

export async function classifyTiers(
  filePaths: string[]
): Promise<Map<string, Tier>> {
  const result = new Map<string, Tier>();
  const unclassified: string[] = [];

  for (const fp of filePaths) {
    const tier = classifyByConvention(fp);
    if (tier) {
      result.set(fp, tier);
    } else {
      unclassified.push(fp);
    }
  }

  if (unclassified.length === 0 || !process.env.GEMINI_API_KEY) {
    for (const fp of unclassified) result.set(fp, 'other');
    return result;
  }

  // Batch into ~50-file chunks, run with LLM_CONCURRENCY cap
  const BATCH_SIZE = 50;
  const LLM_CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY ?? '5');
  const queue = new PQueue({ concurrency: LLM_CONCURRENCY });
  const batches: string[][] = [];
  for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
    batches.push(unclassified.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    batches.map((batch) =>
      queue.add(async () => {
        try {
          const classified = await classifyBatch(batch);
          for (const [fp, tier] of classified) result.set(fp, tier);
        } catch {
          // LLM failure degrades to 'other', never fails the whole job
          for (const fp of batch) result.set(fp, 'other');
        }
      })
    )
  );

  // Fill any remaining unclassified
  for (const fp of unclassified) {
    if (!result.has(fp)) result.set(fp, 'other');
  }

  return result;
}

async function classifyBatch(filePaths: string[]): Promise<Map<string, Tier>> {
  const prompt = `You are classifying source files into architectural tiers.
Valid tiers: "api" (route handlers, endpoint definitions), "logic" (business logic, services, use-cases), "data" (models, schemas, repositories, migrations), "other".

File paths:
${filePaths.map((fp, i) => `${i + 1}. ${fp}`).join('\n')}

Return a JSON object mapping each file path to its tier. Example:
{"routes/auth.ts": "api", "models/User.ts": "data"}`;

  const raw = await callHaiku(prompt);
  const parsed: Record<string, string> = JSON.parse(raw);
  const result = new Map<string, Tier>();
  for (const [fp, tier] of Object.entries(parsed)) {
    result.set(fp, (tier as Tier) ?? 'other');
  }
  return result;
}
