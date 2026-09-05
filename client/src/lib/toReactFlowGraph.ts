export function toReactFlowGraph(
  rawNodes: any[],
  rawEdges: any[],
  positions: Record<string, { x: number; y: number }>,
  csAxisModeGlobal: string,
  impactedFiles: Set<string> = new Set(),
  showFullGraph: boolean = false
) {
  // Step 1: Filter visible nodes if not showing full graph
  let visibleNodes = new Set<string>();
  
  if (showFullGraph || rawNodes.length <= 60 || impactedFiles.size === 0) {
    // Show all if explicitly requested, repo is small, or no bugs found
    rawNodes.forEach(n => visibleNodes.add(n.id));
  } else {
    // 2-hop neighborhood calculation
    impactedFiles.forEach(f => visibleNodes.add(f));
    
    // Hop 1
    const hop1 = new Set<string>();
    rawEdges.forEach(edge => {
      if (impactedFiles.has(edge.source)) hop1.add(edge.target);
      if (impactedFiles.has(edge.target)) hop1.add(edge.source);
    });
    hop1.forEach(f => visibleNodes.add(f));
    
    // Hop 2
    rawEdges.forEach(edge => {
      if (hop1.has(edge.source)) visibleNodes.add(edge.target);
      if (hop1.has(edge.target)) visibleNodes.add(edge.source);
    });
  }

  const rfNodes = rawNodes
    .filter((node) => visibleNodes.has(node.id))
    .map((node) => {
      const isImpacted = node.status === 'impacted';
      const isDownstream = node.status === 'affected-downstream';
      const nodeAxisMode = (isImpacted || isDownstream) ? 'z' : csAxisModeGlobal;

      // Build real code lines from diagnosed data
      const rawLines = node.lines || [];
      const displayLines = rawLines.map((l: any, i: number) => ({
        id: l.id || `${node.id}_${i}`,
        code: l.error ? (l.before || l.code || `// line ${i + 1}`) : (l.code || l.before || `// ${node.file.split('/').pop()}`),
        before: l.before,
        after: l.after,
        hint: l.hint,
        error: l.error || false,
        lineNumber: l.lineNumber,
      }));

      // One layer per file node — use role-specific label when available (fullScan)
      const layers = [
        {
          id: node.id,
          title: node.label || node.file.split('/').pop() || node.id,
          file: node.file,
          lines: displayLines.length > 0 ? displayLines : [
            { id: `${node.id}_ok`, code: `// ${node.file.split('/').pop()} — no issues detected`, error: false }
          ],
        },
      ];

      return {
        id: node.id,
        type: 'crossSection',
        position: positions[node.id] || { x: 0, y: 0 },
        zIndex: nodeAxisMode !== 'collapsed' ? 10 : 0,
        data: {
          label: node.label || node.file.split('/').pop() || node.id,
          file: node.file,
          tier: node.tier,
          status: node.status,
          role: node.role,
          axisMode: nodeAxisMode,
          layers,
        },
      };
    });


  const rfEdges = rawEdges
    .filter(edge => visibleNodes.has(edge.source) && visibleNodes.has(edge.target))
    .map((edge) => {
      // Look up status of source and target nodes
      const srcNode = rawNodes.find(n => n.id === edge.source);
      const tgtNode = rawNodes.find(n => n.id === edge.target);
      const srcStatus = srcNode?.status ?? 'healthy';
      const tgtStatus = tgtNode?.status ?? 'healthy';

      // Red: impacted → impacted or impacted → affected-downstream
      const isErrorPath = srcStatus === 'impacted' || tgtStatus === 'impacted';
      // Amber: affected-downstream involved but no direct impacted
      const isDownstreamPath = !isErrorPath && (srcStatus === 'affected-downstream' || tgtStatus === 'affected-downstream');

      const stroke = isErrorPath ? '#f87171'
        : isDownstreamPath ? '#fb923c'
        : '#334155';
      const strokeWidth = (isErrorPath || isDownstreamPath) ? 2 : 1.5;

      return {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'smoothstep',
        animated: isErrorPath || isDownstreamPath,
        style: { stroke, strokeWidth },
      };
    });

  return { rfNodes, rfEdges };
}
