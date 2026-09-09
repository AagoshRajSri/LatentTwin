import React, { useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppContext } from '../context/AppContext';
import { toReactFlowGraph } from '../lib/toReactFlowGraph';
import { layoutGraph } from '../lib/layoutGraph';
import CrossSectionNode from './CrossSectionNode';
import { Loader } from 'lucide-react';

const GraphViewerInner = () => {
  const { analysis, ui, setUI } = useAppContext();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // Convert graphData to React Flow format whenever the relevant inputs change.
  // useEffect (not useMemo) is correct here because we're calling setState as a
  // side-effect — useMemo is for deriving a return value, never for side effects.
  useEffect(() => {
    if (!analysis.graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const rawNodes = analysis.graphData.nodes ?? [];
    const rawEdges = analysis.graphData.edges ?? [];
    const impactedFiles = new Set(
      rawNodes
        .filter((n) => n.status === 'impacted' || n.status === 'affected-downstream')
        .map((n) => n.id),
    );

    // Step 1: compute positions via dagre layout
    const positions = layoutGraph(rawNodes, rawEdges, ui.csAxisMode || 'z');

    // Step 2: convert to React Flow nodes/edges, passing positions in
    const rfGraph = toReactFlowGraph(
      rawNodes,
      rawEdges,
      positions,
      ui.csAxisMode || 'collapsed',
      impactedFiles,
      ui.showFullGraph,
    );

    setNodes(rfGraph.rfNodes.map((n) => ({
      ...n,
      selected: n.id === analysis.selectedNode?.id,
    })));
    setEdges(
      rfGraph.rfEdges.map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: e.animated || e.source === analysis.selectedNode?.id,
      })),
    );
  }, [analysis.graphData, ui.showFullGraph, ui.csAxisMode, analysis.selectedNode, setNodes, setEdges]);

  // Pan/zoom to the selected node whenever it changes
  useEffect(() => {
    if (!analysis.selectedNode?.id) return;
    // Small delay so layout completes
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: analysis.selectedNode.id }], duration: 500, padding: 0.3 });
    }, 100);
    return () => clearTimeout(t);
  }, [analysis.selectedNode, fitView]);

  if (!analysis.graphData) {
    return (
      <div className="w-full h-full min-h-[500px] bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700" style={{ width: '100%', height: '100%', minHeight: '500px' }}>
        {analysis.analyzing ? (
          <div className="flex flex-col items-center gap-4">
            <Loader size={32} className="animate-spin text-blue-500" />
            <p className="text-gray-400">Analyzing repository...</p>
          </div>
        ) : (
          <p className="text-gray-500">
            {analysis.error
              ? 'Analysis failed. Please check the error message.'
              : 'Enter a repository URL and click "Analyze Repository" to begin.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[500px] bg-slate-900 rounded-lg overflow-hidden border border-slate-700 relative" style={{ width: '100%', height: '100%', minHeight: '500px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={{ crossSection: CrossSectionNode }}
        fitView
        style={{ width: '100%', height: '100%' }}
      >
        <Background color="#334155" gap={12} />
        <Controls />
        <MiniMap
          bgColor="#0f172a"
          nodeColor={(node) => {
            if (node.data.status === 'impacted') return '#ef4444';
            if (node.data.status === 'affected-downstream') return '#f59e0b';
            if (node.data.status === 'context') return '#6366f1';
            return '#64748b';
          }}
        />
      </ReactFlow>

      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={() => setUI({ showFullGraph: !ui.showFullGraph })}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            ui.showFullGraph
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          {ui.showFullGraph ? 'Full Graph' : 'Blast Radius'}
        </button>
      </div>
    </div>
  );
};

export const GraphViewer = () => (
  <ReactFlowProvider>
    <GraphViewerInner />
  </ReactFlowProvider>
);

export default GraphViewer;
