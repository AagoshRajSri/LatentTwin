import path from 'node:path';
import type { FetchedFile } from './fetchRepo.js';
import type { FileGraph } from './buildGraph.js';
import type { Tier } from './classifyTiers.js';
import type { DiagnosisResult } from './diagnoseBug.js';
import type { RepoMeta } from '../lib/githubClient.js';
import type { GraphResult, GraphNode, GraphEdge, DiagnosedLine } from '../schemas/analyzeRequest.js';

export function assembleResult(
  meta: RepoMeta,
  files: FetchedFile[],
  graph: FileGraph,
  tiers: Map<string, Tier>,
  diagnosis: DiagnosisResult | null
): GraphResult {
  const impacted = diagnosis?.impactedFiles ?? new Set<string>();
  const linesByFile = diagnosis?.linesByFile ?? new Map<string, DiagnosedLine[]>();

  // Build node list — one node per source file
  const nodes: GraphNode[] = [];
  for (const file of files) {
    const tier = tiers.get(file.path) ?? 'other';
    const diagnosedLines = linesByFile.get(file.path) ?? [];
    const hasError = diagnosedLines.some((l) => l.error);
    const isImpacted = impacted.has(file.path);

    // Only emit nodes that are reachable via edges OR are directly impacted
    // (This keeps the graph manageable for large repos)
    const isConnected =
      graph.edges.some((e) => e.source === file.path || e.target === file.path);
    if (!isConnected && !isImpacted) continue;

    // For healthy nodes: show the first few real lines of the file as context
    const fileContent = files.find(f => f.path === file.path)?.content || '';
    const snippetLines = fileContent
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('//'))
      .slice(0, 4);

    const lines: DiagnosedLine[] =
      diagnosedLines.length > 0
        ? diagnosedLines
        : snippetLines.length > 0
        ? snippetLines.map((code, i) => ({
            id: `${file.path.replace(/\W/g, '_')}_${i}`,
            code,
            error: false,
          }))
        : [
            {
              id: `${file.path.replace(/\W/g, '_')}_ok`,
              code: `// ${path.basename(file.path)}`,
              error: false,
            },
          ];

    nodes.push({
      id: file.path,
      label: path.basename(file.path),
      file: file.path,
      tier,
      status: hasError ? 'impacted' : isImpacted ? 'impacted' : 'healthy',
      lines,
    });
  }

  // Deduplicate edges and filter to nodes in our set
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgesDeduped = dedupeEdges(
    graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  );

  const edges: GraphEdge[] = edgesDeduped.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  return {
    repo: {
      owner: meta.owner,
      name: meta.name,
      commitSha: meta.commitSha,
    },
    nodes,
    edges,
  };
}

function labelFromPath(filePath: string, tier: Tier): string {
  const base = path.basename(filePath, path.extname(filePath));
  const tierLabels: Record<Tier, string> = {
    api: 'API Entry / Routes',
    logic: 'Business Logic',
    data: 'Database / Schema',
    other: 'Module',
  };
  return `${base} (${tierLabels[tier]})`;
}

function dedupeEdges<T extends { source: string; target: string }>(edges: T[]): T[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.source}→${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
