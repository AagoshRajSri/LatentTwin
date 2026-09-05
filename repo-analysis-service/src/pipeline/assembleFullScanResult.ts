/**
 * assembleFullScanResult.ts
 *
 * Converts a FullScanResult (blast-radius subgraph from scanRepo.ts) into the
 * standard GraphResult shape that both the 2D React Flow graph and the 3D
 * pipeline renderer already know how to display.
 *
 * Only the nodes in the blast radius are included — the entire point of fullScan
 * is to show exactly the buggy file + its direct incoming/outgoing neighbors.
 */

import path from 'node:path';
import type { FetchedFile } from './fetchRepo.js';
import type { Tier } from './classifyTiers.js';
import type { FullScanResult } from './scanRepo.js';
import type { RepoMeta } from '../lib/githubClient.js';
import type { GraphResult, GraphNode, GraphEdge, DiagnosedLine } from '../schemas/analyzeRequest.js';

export function assembleFullScanResult(
  meta: RepoMeta,
  files: FetchedFile[],
  tiers: Map<string, Tier>,
  scan: FullScanResult,
): GraphResult {
  const fileMap = new Map(files.map(f => [f.path, f.content]));

  const nodes: GraphNode[] = scan.blastRadius.map(blastNode => {
    const tier = tiers.get(blastNode.file) ?? 'other';
    const content = fileMap.get(blastNode.file) ?? '';

    // For non-buggy nodes, show a real snippet of their code as context
    const snippetLines: DiagnosedLine[] = blastNode.lines.length === 0
      ? content
          .split('\n')
          .filter(l => l.trim() && !l.trim().startsWith('//'))
          .slice(0, 4)
          .map((code, i) => ({
            id: `${blastNode.file.replace(/\W/g, '_')}_ctx_${i}`,
            code,
            error: false,
          }))
      : [];

    // Build label from role (specific) — this is what differs from the generic assembler
    const basename = path.basename(blastNode.file);
    const label = blastNode.role
      ? `${basename} — ${blastNode.role}`
      : basename;

    return {
      id: blastNode.file,
      label,
      file: blastNode.file,
      tier,
      status: blastNode.status,
      role: blastNode.role,
      lines: blastNode.lines.length > 0 ? blastNode.lines : snippetLines,
    } as GraphNode;
  });

  // Deduplicate and validate edges
  const nodeIds = new Set(nodes.map(n => n.id));
  const seen = new Set<string>();
  const edges: GraphEdge[] = scan.edges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .filter(e => {
      const key = `${e.source}→${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(e => ({ source: e.source, target: e.target }));

  return {
    repo: { owner: meta.owner, name: meta.name, commitSha: meta.commitSha },
    nodes,
    edges,
  };
}
