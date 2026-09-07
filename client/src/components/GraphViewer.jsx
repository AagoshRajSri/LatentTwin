/**
 * GraphViewer Component
 * Displays the React Flow graph visualization
 */

import React, { useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppContext } from '../context/AppContext';
import { toReactFlowGraph } from '../lib/toReactFlowGraph';
import { layoutGraph } from '../lib/layoutGraph';
import CrossSectionNode from './CrossSectionNode';
import { Loader } from 'lucide-react';

export const GraphViewer = () => {
  const { analysis, ui, setUI } = useAppContext();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Convert graphData to React Flow format
  useMemo(() => {
    if (!analysis.graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const rfGraph = toReactFlowGraph(analysis.graphData, {
      showFullGraph: ui.showFullGraph,
    });

    // Apply layout
    const layouted = layoutGraph(rfGraph.nodes, rfGraph.edges);

    setNodes(layouted.nodes);
    setEdges(
      rfGraph.edges.map((e) => ({
        ...e,
        markerEnd: MarkerType.ArrowClosed,
        animated: e.source === analysis.selectedNode?.id,
      }))
    );
  }, [analysis.graphData, ui.showFullGraph, analysis.selectedNode, setNodes, setEdges]);

  if (!analysis.graphData) {
    return (
      <div className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700">
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
    <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={{ crossSection: CrossSectionNode }}
        fitView
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

export default GraphViewer;
