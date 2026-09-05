import dagre from 'dagre';

export function layoutGraph(
  nodes: { id: string }[],
  edges: { source: string; target: string }[]
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  // Generous ranksep (vertical gap between ranks) and nodesep (gap between
  // nodes in the same rank) so crossSection cards (which can be tall when
  // expanded) never visually collide.
  g.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 350, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  // CrossSection cards are ~348px wide × 110px tall in collapsed mode.
  // Using a slightly larger footprint keeps the layout breathing room.
  const nodeWidth  = 360;
  const nodeHeight = 120;
  for (const node of nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const nodeWithPos = g.node(node.id);
    if (nodeWithPos) {
      // dagre returns center point, react flow wants top-left corner
      positions[node.id] = {
        x: nodeWithPos.x - nodeWidth / 2,
        y: nodeWithPos.y - nodeHeight / 2,
      };
    } else {
      positions[node.id] = { x: 0, y: 0 };
    }
  }

  return positions;
}
