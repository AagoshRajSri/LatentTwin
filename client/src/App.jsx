import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Activity, Database, Server, Box, GitMerge, AlertCircle, Info } from 'lucide-react';

const NODE_TYPES = {
  service: 'service',
  infrastructure: 'infrastructure',
};

const CustomServiceNode = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-md rounded-md bg-gray-800 border-2 ${selected ? 'border-blue-500' : 'border-gray-600'} text-white flex items-center gap-3 min-w-[150px]`}>
      <div className="bg-blue-500/20 p-2 rounded-md">
        <Server size={18} className="text-blue-400" />
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-sm">{data.label}</span>
        <span className="text-xs text-gray-400">Service</span>
      </div>
    </div>
  );
};

const CustomInfraNode = ({ data, selected }) => {
  return (
    <div className={`px-4 py-3 shadow-md rounded-md bg-gray-900 border-2 ${selected ? 'border-purple-500' : 'border-gray-700'} text-white flex items-center gap-3 min-w-[150px]`}>
      <div className="bg-purple-500/20 p-2 rounded-md">
        <Database size={18} className="text-purple-400" />
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-sm">{data.label}</span>
        <span className="text-xs text-gray-400">Infrastructure</span>
      </div>
    </div>
  );
};

const nodeTypes = {
  service: CustomServiceNode,
  infrastructure: CustomInfraNode,
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('connecting');

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const response = await fetch('/api/graph');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setGraphData(data);
        
        // Transform backend data to React Flow format
        const rfNodes = data.nodes.map((node, index) => {
          // Simple layout algorithm (could be improved)
          const cols = 3;
          const x = (index % cols) * 250 + 100;
          const y = Math.floor(index / cols) * 150 + 100;
          
          return {
            id: node.id,
            type: node.type,
            position: { x, y },
            data: { 
              label: node.name,
              ...node 
            }
          };
        });

        const rfEdges = data.edges.map(edge => ({
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          animated: edge.type === 'implicit',
          style: {
            stroke: edge.type === 'implicit' ? '#f59e0b' : '#94a3b8',
            strokeWidth: edge.type === 'implicit' ? 2 : 1.5,
            strokeDasharray: edge.type === 'implicit' ? '5,5' : 'none',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.type === 'implicit' ? '#f59e0b' : '#94a3b8',
          },
          data: { type: edge.type }
        }));

        setNodes(rfNodes);
        setEdges(rfEdges);
        setBackendStatus('connected');
        setLoading(false);
      } catch (error) {
        console.error('Error fetching graph:', error);
        setBackendStatus('error');
        setLoading(false);
      }
    };

    fetchGraph();
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-950 font-sans">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-gray-800 bg-gray-900 px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Activity className="text-blue-500" />
          <div>
            <h1 className="text-lg font-semibold text-white leading-tight">LatentTwin</h1>
            <p className="text-xs text-gray-400">Codebase Digital Twin & Self-Healing Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">API:</span>
            {backendStatus === 'connected' ? (
              <span className="flex items-center gap-1.5 text-green-400 bg-green-400/10 px-2 py-1 rounded-md text-xs font-medium border border-green-400/20">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Connected
              </span>
            ) : backendStatus === 'connecting' ? (
              <span className="flex items-center gap-1.5 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-md text-xs font-medium border border-yellow-400/20">
                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                Connecting...
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2 py-1 rounded-md text-xs font-medium border border-red-400/20">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                Disconnected
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Graph Canvas */}
        <div className="flex-1 h-full bg-grid-pattern relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="flex flex-col items-center gap-3">
                <Activity className="animate-spin text-blue-500" size={32} />
                <span>Loading Architecture Graph...</span>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-transparent"
              colorMode="dark"
            >
              <Background color="#334155" gap={20} size={1} />
              <Controls className="bg-gray-800 border-gray-700 text-gray-300 fill-gray-300" />
              <MiniMap 
                nodeStrokeColor={(n) => {
                  if (n.type === 'service') return '#3b82f6';
                  return '#a855f7';
                }}
                nodeColor={(n) => {
                  if (n.type === 'service') return '#1e293b';
                  return '#0f172a';
                }}
                maskColor="rgba(15, 23, 42, 0.8)"
                className="bg-gray-900 border border-gray-800"
              />
              
              {/* Legend overlay */}
              <div className="absolute bottom-6 left-6 z-10 bg-gray-900/90 border border-gray-800 p-4 rounded-lg shadow-xl backdrop-blur-sm">
                <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Dependency Types</h3>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-0.5 bg-slate-400"></div>
                    <span className="text-gray-300">Explicit / Direct Call</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 border-b-2 border-dashed border-amber-500"></div>
                    <span className="text-gray-300">Implicit / Runtime Event</span>
                  </div>
                </div>
              </div>
            </ReactFlow>
          )}
        </div>

        {/* Node Details Panel */}
        {selectedNode && (
          <div className="w-96 border-l border-gray-800 bg-gray-900 overflow-y-auto flex flex-col shadow-2xl z-20 transition-transform">
            <div className="p-5 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedNode.type === 'service' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {selectedNode.type === 'service' ? <Server size={24} /> : <Database size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedNode.data.name}</h2>
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{selectedNode.data.type}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-5 flex-1 flex flex-col gap-6">
              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2 mb-2">
                  <Info size={16} /> Description
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/50 p-3 rounded-lg border border-gray-800/80">
                  {selectedNode.data.description || 'No description available for this node.'}
                </p>
              </div>

              {/* Connections */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2 mb-3">
                  <Activity size={16} /> Dependencies
                </h3>
                <div className="flex flex-col gap-2">
                  {edges.filter(e => e.source === selectedNode.id).length > 0 ? (
                    <div>
                      <span className="text-xs text-gray-500 mb-1 block">Outgoing (Depends On)</span>
                      {edges.filter(e => e.source === selectedNode.id).map(e => {
                        const targetNode = nodes.find(n => n.id === e.target);
                        return (
                          <div key={e.id} className="flex items-center justify-between text-sm bg-gray-800/50 p-2 rounded-md border border-gray-800">
                            <span className="text-gray-300">{targetNode?.data.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wide font-medium ${
                              e.data?.type === 'implicit' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {e.data?.type || 'explicit'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 italic">No outgoing dependencies</span>
                  )}
                  
                  {edges.filter(e => e.target === selectedNode.id).length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500 mb-1 block">Incoming (Required By)</span>
                      {edges.filter(e => e.target === selectedNode.id).map(e => {
                        const sourceNode = nodes.find(n => n.id === e.source);
                        return (
                          <div key={e.id} className="flex items-center justify-between text-sm bg-gray-800/50 p-2 rounded-md border border-gray-800">
                            <span className="text-gray-300">{sourceNode?.data.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wide font-medium ${
                              e.data?.type === 'implicit' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {e.data?.type || 'explicit'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Invariants */}
              {selectedNode.data.invariants && selectedNode.data.invariants.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2 mb-3">
                    <GitMerge size={16} /> Historical PR Invariants
                  </h3>
                  <div className="flex flex-col gap-3">
                    {selectedNode.data.invariants.map((inv, idx) => (
                      <div key={idx} className="bg-blue-900/10 border border-blue-900/30 p-3 rounded-lg flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                            {inv.pr}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">
                          {inv.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
