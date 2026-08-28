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
import { Activity, Database, Server, Box, GitMerge, AlertCircle, Info, Zap, AlertTriangle, RefreshCw } from 'lucide-react';

const CustomServiceNode = ({ data, selected }) => {
  const isImpacted = data.isImpacted;
  const isTarget = data.isTarget;

  let borderColor = selected ? 'border-blue-500' : 'border-gray-600';
  let bgColor = 'bg-gray-800';
  let badgeColor = 'bg-blue-500/20 text-blue-400';

  if (isTarget) {
    borderColor = 'border-amber-500 shadow-amber-500/50 shadow-lg';
    bgColor = 'bg-amber-950/40';
    badgeColor = 'bg-amber-500/20 text-amber-400';
  } else if (isImpacted) {
    borderColor = 'border-red-500 shadow-red-500/50 shadow-lg animate-pulse';
    bgColor = 'bg-red-950/40';
    badgeColor = 'bg-red-500/20 text-red-400';
  }

  return (
    <div className={`px-4 py-3 shadow-md rounded-md ${bgColor} border-2 ${borderColor} text-white flex items-center gap-3 min-w-[150px] transition-all`}>
      <div className={`p-2 rounded-md ${badgeColor}`}>
        <Server size={18} />
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-sm flex items-center gap-1.5">
          {data.label}
          {isImpacted && !isTarget && (
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
          )}
        </span>
        <span className="text-xs text-gray-400">
          {isTarget ? 'Target Service' : isImpacted ? 'Impacted Service' : 'Service'}
        </span>
      </div>
    </div>
  );
};

const CustomInfraNode = ({ data, selected }) => {
  const isImpacted = data.isImpacted;
  const isTarget = data.isTarget;

  let borderColor = selected ? 'border-purple-500' : 'border-gray-700';
  let bgColor = 'bg-gray-900';
  let badgeColor = 'bg-purple-500/20 text-purple-400';

  if (isTarget) {
    borderColor = 'border-amber-500 shadow-amber-500/50 shadow-lg';
    bgColor = 'bg-amber-950/40';
    badgeColor = 'bg-amber-500/20 text-amber-400';
  } else if (isImpacted) {
    borderColor = 'border-red-500 shadow-red-500/50 shadow-lg animate-pulse';
    bgColor = 'bg-red-950/40';
    badgeColor = 'bg-red-500/20 text-red-400';
  }

  return (
    <div className={`px-4 py-3 shadow-md rounded-md ${bgColor} border-2 ${borderColor} text-white flex items-center gap-3 min-w-[150px] transition-all`}>
      <div className={`p-2 rounded-md ${badgeColor}`}>
        <Database size={18} />
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-sm flex items-center gap-1.5">
          {data.label}
          {isImpacted && !isTarget && (
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
          )}
        </span>
        <span className="text-xs text-gray-400">
          {isTarget ? 'Target Queue' : isImpacted ? 'Impacted Queue' : 'Infrastructure'}
        </span>
      </div>
    </div>
  );
};

const nodeTypes = {
  service: CustomServiceNode,
  infrastructure: CustomInfraNode,
  queue: CustomInfraNode,
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('connecting');

  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const response = await fetch('/api/graph');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setGraphData(data);
        
        // Transform backend data to React Flow format
        const rfNodes = data.nodes.map((node, index) => {
          const cols = 3;
          const x = (index % cols) * 250 + 100;
          const y = Math.floor(index / cols) * 150 + 100;
          
          return {
            id: node.id,
            type: node.type,
            position: { x, y },
            data: { 
              label: node.name,
              isImpacted: false,
              isTarget: false,
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

  const handleSimulateBreak = async () => {
    setSimulating(true);
    try {
      const response = await fetch('/api/simulate-break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'auth-service',
          change: 'rename user_id to userId'
        })
      });
      if (!response.ok) throw new Error('Simulation failed');
      const data = await response.json();
      setSimulationResult(data);

      const affectedSet = new Set(data.affectedNodes || []);
      const pathNodes = data.dependencyPath || [];

      // Create a set of edges along the path
      const pathEdgeSet = new Set();
      for (let i = 0; i < pathNodes.length - 1; i++) {
        pathEdgeSet.add(`${pathNodes[i]}-${pathNodes[i+1]}`);
      }

      // Update nodes state with affected state
      setNodes(prevNodes =>
        prevNodes.map(node => {
          const isImpacted = affectedSet.has(node.id);
          const isTarget = node.id === data.target;
          return {
            ...node,
            data: {
              ...node.data,
              isImpacted,
              isTarget
            }
          };
        })
      );

      // Update edges state to highlight dependency path
      setEdges(prevEdges =>
        prevEdges.map(edge => {
          const isBlastPath = pathEdgeSet.has(edge.id);
          if (isBlastPath) {
            return {
              ...edge,
              animated: true,
              style: {
                stroke: '#ef4444',
                strokeWidth: 3.5,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#ef4444',
              }
            };
          }
          return edge;
        })
      );

    } catch (err) {
      console.error('Error running simulation:', err);
    } finally {
      setSimulating(false);
    }
  };

  const handleResetSimulation = () => {
    setSimulationResult(null);
    if (!graphData) return;

    setNodes(prevNodes =>
      prevNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          isImpacted: false,
          isTarget: false
        }
      }))
    );

    setEdges(graphData.edges.map(edge => ({
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
    })));
  };

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
                  {simulationResult && (
                    <div className="flex items-center gap-3 pt-1 border-t border-gray-800">
                      <div className="w-8 h-1 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-red-400 font-medium text-xs">Blast Radius Path</span>
                    </div>
                  )}
                </div>
              </div>
            </ReactFlow>
          )}
        </div>

        {/* Action Toolbar / Summary Overlay */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-3 max-w-sm">
          {/* Inject Breaking Change Control */}
          <div className="bg-gray-900/95 border border-gray-800 p-4 rounded-xl shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={14} className="text-amber-400" /> Simulator Control
              </span>
              {simulationResult && (
                <button
                  onClick={handleResetSimulation}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 bg-gray-800 px-2 py-0.5 rounded border border-gray-700 transition"
                >
                  <RefreshCw size={12} /> Reset
                </button>
              )}
            </div>

            <button
              onClick={handleSimulateBreak}
              disabled={simulating}
              className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-medium text-sm py-2.5 px-4 rounded-lg shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <AlertTriangle size={16} />
              {simulating ? 'Simulating...' : 'Inject Breaking Change — Rename user_id'}
            </button>
          </div>

          {/* Blast Radius Summary Card */}
          {simulationResult && (
            <div className="bg-red-950/40 border border-red-800/60 p-4 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-red-800/40 pb-2">
                <AlertCircle className="text-red-400 shrink-0" size={18} />
                <h2 className="text-sm font-bold text-red-200 uppercase tracking-wide">
                  Breaking change detected
                </h2>
              </div>

              <div className="bg-red-900/20 border border-red-800/40 p-2.5 rounded-lg text-center font-mono text-xs text-red-300">
                user_id → userId
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Blast radius:
                </h3>
                <div className="flex flex-col gap-1.5">
                  {simulationResult.affectedNodes
                    ?.filter(nodeId => nodeId !== simulationResult.target)
                    .map(nodeId => {
                      const nodeObj = nodes.find(n => n.id === nodeId);
                      const name = nodeObj ? nodeObj.data.name : nodeId;
                      return (
                        <div key={nodeId} className="flex items-center gap-2 text-sm text-red-200 bg-red-950/60 border border-red-800/40 px-3 py-1.5 rounded-md font-medium">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          <span>{name}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {simulationResult.relevantInvariants && simulationResult.relevantInvariants.length > 0 && (
                <div className="pt-2 border-t border-red-800/40">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <GitMerge size={12} className="text-red-400" /> Historical PR Invariants:
                  </h3>
                  <div className="flex flex-col gap-2">
                    {simulationResult.relevantInvariants.map((inv, idx) => (
                      <div key={idx} className="bg-gray-900/80 border border-gray-800 p-2 rounded text-xs text-gray-300">
                        <span className="font-mono bg-red-500/20 text-red-300 px-1 py-0.5 rounded text-[10px] mr-1.5">
                          {inv.pr}
                        </span>
                        <span>{inv.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
