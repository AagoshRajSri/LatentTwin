import { z } from 'zod';

const GITHUB_URL_REGEX = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+.*$/i;

export const ContentBugInputSchema = z.object({
  type: z.enum(['stackTrace', 'testFailure', 'description']),
  content: z.string().min(1).max(50_000),
});

export const BugInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stackTrace'),   content: z.string().min(1).max(50_000) }),
  z.object({ type: z.literal('testFailure'),  content: z.string().min(1).max(50_000) }),
  z.object({ type: z.literal('description'), content: z.string().min(1).max(50_000) }),
  z.object({ type: z.literal('fullScan') }),   // no content needed — service scans the repo itself
]);

export const AnalyzeRequestSchema = z.object({
  repoUrl: z.string().regex(GITHUB_URL_REGEX, 'Must be a valid https://github.com/<owner>/<repo> URL'),
  branch: z.string().optional(),
  githubToken: z.string().optional(),
  bugInput: BugInputSchema.optional(),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type BugInput = z.infer<typeof ContentBugInputSchema>;
export type AnyBugInput = z.infer<typeof BugInputSchema>;


export const DiagnosedLineSchema = z.object({
  id: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  error: z.boolean(),
  hint: z.string().optional(),
  lineNumber: z.number().optional(),
  code: z.string().optional(),
});

export const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  file: z.string(),
  tier: z.enum(['api', 'logic', 'data', 'other']),
  status: z.enum(['healthy', 'impacted', 'resolved', 'affected-downstream', 'context']),
  role: z.string().optional(),   // per-node role label from fullScan (e.g. "root cause")
  lines: z.array(DiagnosedLineSchema),
});

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
});

export const GraphResultSchema = z.object({
  repo: z.object({
    owner: z.string(),
    name: z.string(),
    commitSha: z.string(),
  }),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export type DiagnosedLine = z.infer<typeof DiagnosedLineSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphResult = z.infer<typeof GraphResultSchema>;
