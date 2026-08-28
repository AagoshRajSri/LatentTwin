import React, { useState, useEffect, useMemo, useCallback } from 'react';
  import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    MarkerType,
    useReactFlow,
    ReactFlowProvider,
    Handle,
    Position
  } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Activity, Database, Server, Box, GitMerge, AlertCircle, Info, Zap, AlertTriangle, RefreshCw, Wrench } from 'lucide-react';

const CustomServiceNode = ({ data, selected, id }) => {
  const isImpacted = data.isImpacted;
  const isTarget = data.isTarget;

  let borderColor = selected ? 'border-blue-500' : 'border-gray-700';
  let bgColor = 'bg-gray-900';
  let badgeColor = 'bg-blue-500/10 text-blue-500';

  if (isTarget) {
    borderColor = 'border-amber-500 shadow-md shadow-amber-900/20';
    bgColor = 'bg-amber-950/80';
    badgeColor = 'bg-amber-500/20 text-amber-500';
  } else if (isImpacted) {
    borderColor = 'border-red-500 shadow-md shadow-red-900/20';
    bgColor = 'bg-red-950/80';
    badgeColor = 'bg-red-500/20 text-red-500';
  }

  return (
    <>
      <Handle 
        type="target" 
        position={Position.Left} 
        id="target" 
        className="w-2 h-2 !bg-gray-500 border-none opacity-0" 
      />
      <div className={`px-5 py-4 shadow-lg rounded ${bgColor} border ${borderColor} text-white flex items-center gap-4 min-w-[180px] transition-all`}>
        <div className={`p-2 rounded ${badgeColor}`}>
          <Server size={18} />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm flex items-center gap-2 tracking-wide">
            {data.label}
            {isImpacted && !isTarget && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mt-0.5">
            {isTarget ? 'Target Service' : isImpacted ? 'Impacted Service' : 'Service'}
          </span>
        </div>
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="source" 
        className="w-2 h-2 !bg-gray-500 border-none opacity-0" 
      />
    </>
  );
};

const CustomInfraNode = ({ data, selected, id }) => {
  const isImpacted = data.isImpacted;
  const isTarget = data.isTarget;

  let borderColor = selected ? 'border-purple-500' : 'border-gray-700';
  let bgColor = 'bg-gray-900';
  let badgeColor = 'bg-purple-500/20 text-purple-400';

  if (isTarget) {
    borderColor = 'border-amber-500 shadow-md shadow-amber-900/20';
    bgColor = 'bg-amber-950/80';
    badgeColor = 'bg-amber-500/20 text-amber-500';
  } else if (isImpacted) {
    borderColor = 'border-red-500 shadow-md shadow-red-900/20';
    bgColor = 'bg-red-950/80';
    badgeColor = 'bg-red-500/20 text-red-500';
  }

  return (
    <>
      <Handle 
        type="target" 
        position={Position.Left} 
        id="target" 
        className="w-2 h-2 !bg-purple-500 border-none opacity-0" 
      />
      <div className={`px-5 py-4 shadow-lg rounded ${bgColor} border ${borderColor} text-white flex items-center gap-4 min-w-[180px] transition-all`}>
        <div className={`p-2 rounded ${badgeColor}`}>
          <Database size={18} />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm flex items-center gap-2 tracking-wide">
            {data.label}
            {isImpacted && !isTarget && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mt-0.5">
            {isTarget ? 'Target Queue' : isImpacted ? 'Impacted Queue' : 'Infrastructure'}
          </span>
        </div>
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="source" 
        className="w-2 h-2 !bg-purple-500 border-none opacity-0" 
      />
    </>
  );
};

const nodeTypes = {
  service: CustomServiceNode,
  infrastructure: CustomInfraNode,
  queue: CustomInfraNode,
};

  function FlowContent() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [graphData, setGraphData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [backendStatus, setBackendStatus] = useState('connecting');
  
    const [simulationResult, setSimulationResult] = useState(null);
    const [simulating, setSimulating] = useState(false);
    const [repairData, setRepairData] = useState(null);
    const [loadingRepair, setLoadingRepair] = useState(false);
    const [repairPanelOpen, setRepairPanelOpen] = useState(false);
    const [applyingPatch, setApplyingPatch] = useState(false);
    const [applyResult, setApplyResult] = useState(null);
    
    const { fitView } = useReactFlow();

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const response = await fetch('/api/graph');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setGraphData(data);
        
        // Transform backend data to React Flow format
        const rfNodes = data.nodes.map((node, index) => {
          // Layout: auth -> queue -> worker in a horizontal line
          let x, y;
          if (node.id === 'auth-service') {
            x = 100; y = 200;
          } else if (node.id === 'event-queue') {
            x = 400; y = 200;
          } else if (node.id === 'worker-service') {
            x = 700; y = 200;
          } else {
            const cols = 3;
            x = (index % cols) * 250 + 100;
            y = Math.floor(index / cols) * 150 + 100;
          }
          
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

        const rfEdges = data.edges.map(edge => {
          const isImplicit = edge.relationshipType === 'implicit_queue' || edge.relationshipType === 'implicit_db' || edge.type === 'implicit' || edge.type === 'subscribes';
          return {
            id: `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'smoothstep',
            animated: isImplicit,
            style: {
              stroke: isImplicit ? '#f59e0b' : '#94a3b8',
              strokeWidth: isImplicit ? 2 : 1.5,
              strokeDasharray: isImplicit ? '5,5' : 'none',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isImplicit ? '#f59e0b' : '#94a3b8',
            },
            data: { type: edge.type, relationshipType: edge.relationshipType }
          };
        });

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
    setRepairPanelOpen(false);
    setRepairData(null);
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
  
        // Center view on affected nodes
        setTimeout(() => {
          fitView({
            padding: 0.2,
            duration: 800,
            nodes: pathNodes.map(id => ({ id }))
          });
        }, 100);

    } catch (err) {
      console.error('Error running simulation:', err);
    } finally {
      setSimulating(false);
    }
  };

    const handleResetSimulation = () => {
      setSimulationResult(null);
      setRepairPanelOpen(false);
      setRepairData(null);
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
  
      setEdges(graphData.edges.map(edge => {
        const isImplicit = edge.relationshipType === 'implicit_queue' || edge.relationshipType === 'implicit_db' || edge.type === 'implicit' || edge.type === 'subscribes';
        return {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          sourceHandle: 'source',
          targetHandle: 'target',
          type: 'smoothstep',
          animated: isImplicit,
          style: {
            stroke: isImplicit ? '#f59e0b' : '#94a3b8',
            strokeWidth: isImplicit ? 2 : 1.5,
            strokeDasharray: isImplicit ? '5,5' : 'none',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isImplicit ? '#f59e0b' : '#94a3b8',
          },
          data: { type: edge.type, relationshipType: edge.relationshipType }
        };
      }));
      
      setTimeout(() => {
        fitView({
          padding: 0.1,
          duration: 800
        });
      }, 100);
    };

  const handleReset = () => {
    setSimulationResult(null);
    setRepairData(null);
    setRepairPanelOpen(false);
    setApplyResult(null);
    setSelectedNode(null);
    
    // Reset visual state of nodes and edges
    setNodes(nodes => nodes.map(n => ({
      ...n,
      style: {
        ...n.style,
        opacity: 1,
        boxShadow: n.data.type === 'service' 
          ? '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)' 
          : '0 4px 6px -1px rgba(168, 85, 247, 0.1), 0 2px 4px -1px rgba(168, 85, 247, 0.06)'
      },
      data: {
        ...n.data,
        isBroken: false,
        isAffected: false
      }
    })));

    setEdges(edges => edges.map(e => ({
      ...e,
      style: { ...e.style, stroke: '#4b5563', strokeWidth: 1, opacity: 1 },
      animated: true,
      className: ''
    })));
  };

  const handleGenerateRepair = async () => {
    setLoadingRepair(true);
    setRepairPanelOpen(true);
    setApplyResult(null); // Reset any previous apply results
    try {
      const response = await fetch('/api/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: simulationResult.target,
          change: simulationResult.change
        })
      });
      if (!response.ok) throw new Error('Repair generation failed');
      const data = await response.json();
      setRepairData(data);
    } catch (err) {
      console.error('Error generating repair:', err);
    } finally {
      setLoadingRepair(false);
    }
  };

  const handleApplyPatch = async () => {
    setApplyingPatch(true);
    setApplyResult(null);
    try {
      const response = await fetch('/api/apply-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repairInfo: repairData
        })
      });
      const data = await response.json();
      setApplyResult(data);
      
      if (data.status === 'SYSTEM HEALED') {
        // Clear the blast radius visual state but keep the panel open
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
        
        setEdges(prevEdges => prevEdges.map(edge => {
          const isImplicit = edge.data?.relationshipType === 'implicit_queue' || edge.data?.relationshipType === 'implicit_db' || edge.data?.type === 'implicit' || edge.data?.type === 'subscribes';
          return {
            ...edge,
            animated: isImplicit,
            style: {
              stroke: isImplicit ? '#f59e0b' : '#94a3b8',
              strokeWidth: isImplicit ? 2 : 1.5,
              strokeDasharray: isImplicit ? '5,5' : 'none',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isImplicit ? '#f59e0b' : '#94a3b8',
            }
          };
        }));
      }
    } catch (err) {
      console.error('Error applying patch:', err);
      setApplyResult({
        status: 'REPAIR FAILED',
        message: 'Network error or server crash while applying patch.'
      });
    } finally {
      setApplyingPatch(false);
    }
  };

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
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
          
          <div className="flex items-center gap-6">
            {/* System Status Indicator */}
            {simulationResult && applyResult?.status !== 'SYSTEM HEALED' ? (
              <div className="flex flex-col items-end">
                <span className="flex items-center gap-2 text-red-500 font-bold text-xs uppercase tracking-widest">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  Critical: Blast Radius Detected
                </span>
              </div>
            ) : applyResult?.status === 'SYSTEM HEALED' ? (
              <div className="flex items-center gap-2 text-green-500 font-bold text-xs uppercase tracking-widest">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                System Healed
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-500 font-bold text-xs uppercase tracking-widest">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                System Operational
              </div>
            )}
  
            <div className="h-6 w-px bg-gray-800"></div>
  
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
              
              {/* Removed absolute Legend overlay from here */}
            </ReactFlow>
          )}
        </div>

        {/* Left Side Navigation / State / Overlay */}
        <div className="absolute top-6 bottom-6 left-6 z-20 flex flex-col gap-4 w-80 max-h-full overflow-y-auto pointer-events-none pb-4 hide-scrollbar">
          {/* Inject Breaking Change Control */}
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-xl pointer-events-auto shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <Zap size={14} className="text-amber-500" /> Simulator
              </span>
              {simulationResult && (
                <button
                  onClick={handleResetSimulation}
                  className="text-[10px] uppercase font-bold tracking-wider text-gray-400 hover:text-white flex items-center gap-1 bg-gray-800 px-2 py-1 rounded border border-gray-700 transition"
                >
                  <RefreshCw size={12} /> Reset
                </button>
              )}
            </div>

            <button
              onClick={handleSimulateBreak}
              disabled={simulating}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs uppercase tracking-wide py-2.5 px-4 rounded-lg shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <AlertTriangle size={14} />
              {simulating ? 'Simulating...' : 'Inject Breaking Change'}
            </button>
          </div>

          {/* Blast Radius Summary Card */}
          {simulationResult && applyResult?.status !== 'SYSTEM HEALED' && (
            <div className="bg-red-950/80 border border-red-900/50 p-4 rounded-xl shadow-xl animate-fade-in flex flex-col gap-4 pointer-events-auto shrink-0">
              <div className="flex flex-col gap-1 border-b border-red-900/50 pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="text-red-500 shrink-0" size={16} />
                  <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                    Critical Error
                  </h2>
                </div>
                <div className="font-mono text-xs text-red-200 mt-1 pl-6">
                  Type mismatch: user_id → userId
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Blast Radius
                </h3>
                <div className="flex flex-col gap-1.5">
                  {simulationResult.affectedNodes
                    ?.filter(nodeId => nodeId !== simulationResult.target)
                    .map(nodeId => {
                      const nodeObj = nodes.find(n => n.id === nodeId);
                      const name = nodeObj ? nodeObj.data.name : nodeId;
                      return (
                        <div key={nodeId} className="flex items-center gap-2 text-xs text-red-300 bg-red-900/20 border border-red-900/30 px-2 py-1.5 rounded font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          <span>{name}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {simulationResult.relevantInvariants && simulationResult.relevantInvariants.length > 0 && (
                <div className="pt-3 border-t border-red-900/50">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <GitMerge size={12} className="text-gray-400" /> Applicable Invariants
                  </h3>
                  <div className="flex flex-col gap-2">
                    {simulationResult.relevantInvariants.map((inv, idx) => (
                      <div key={idx} className="bg-gray-900/50 border border-gray-800 p-2 rounded text-xs text-gray-400 leading-relaxed">
                        <span className="font-mono text-gray-500 mr-2">
                          {inv.pr}
                        </span>
                        <span>{inv.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {simulationResult.relevantInvariants && simulationResult.relevantInvariants.length > 0 && (
                <div className="pt-3 border-t border-red-900/50 mt-1">
                  <button
                    onClick={handleGenerateRepair}
                    disabled={loadingRepair}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs uppercase tracking-wide py-2.5 px-4 rounded-lg shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Wrench size={14} />
                    {loadingRepair ? 'Generating...' : 'Generate Repair'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Dependency Types Legend inside left panel flow */}
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-xl pointer-events-auto shrink-0 mt-auto">
            <h3 className="text-[10px] font-bold text-gray-500 mb-3 uppercase tracking-widest">Dependency Types</h3>
            <div className="flex flex-col gap-3 text-xs font-medium">
              <div className="flex items-center gap-3">
                <div className="w-6 h-0.5 bg-gray-500"></div>
                <span className="text-gray-400">Explicit Call</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 border-b-2 border-dashed border-gray-500"></div>
                <span className="text-gray-400">Implicit Event</span>
              </div>
              {simulationResult && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
                  <div className="w-6 h-0.5 bg-red-500"></div>
                  <span className="text-red-400">Blast Radius Path</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Repair Panel Overlay */}
        {repairPanelOpen && (
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] max-w-full bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col transition-all animate-fade-in">
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Wrench className="text-blue-400" size={18} />
                <h2 className="text-sm font-bold text-white tracking-wide">LatentCode Autonomous Patch</h2>
              </div>
              <button 
                onClick={() => setRepairPanelOpen(false)}
                className="text-gray-500 hover:text-white transition"
              >
                &times;
              </button>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {loadingRepair ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-500">
                  <Activity className="animate-spin text-blue-500" size={24} />
                  <span className="text-[10px] uppercase font-bold tracking-widest">Synthesizing patch...</span>
                </div>
              ) : repairData ? (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-gray-800 p-3 rounded">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Detected Change</span>
                      <span className="font-mono text-red-400 text-xs">{repairData.detectedChange}</span>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 p-3 rounded">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Affected Service</span>
                      <span className="text-gray-200 text-xs font-semibold">{repairData.affectedService}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">Dependency Trace</h3>
                    <div className="flex items-center gap-2 text-xs font-mono bg-gray-900 p-3 rounded border border-gray-800 overflow-x-auto text-gray-400 whitespace-nowrap">
                      {repairData.dependencyPath.map((node, i) => (
                        <React.Fragment key={node}>
                          <span>{node}</span>
                          {i < repairData.dependencyPath.length - 1 && <span className="text-gray-600">→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">Applicable Invariants</h3>
                    <div className="flex flex-col gap-2">
                      {repairData.historicalInvariants.map((inv, i) => (
                        <div key={i} className="text-xs text-gray-300 bg-gray-900 border border-gray-800 p-3 rounded flex flex-col gap-1.5 leading-relaxed">
                          <span className="font-mono text-blue-400 text-[10px]">{inv.pr}</span>
                          <span>{inv.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">Proposed Repair</h3>
                    <p className="text-xs text-gray-300 bg-gray-900 p-4 rounded border border-gray-800 leading-relaxed">
                      {repairData.proposedRepair}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">Generated Patch</h3>
                    <div className="max-h-[320px] overflow-auto rounded border border-gray-800 bg-gray-950 shadow-inner">
                      <pre className="text-[11px] font-mono p-4 min-w-max leading-relaxed">
                        {repairData.diff.split('\n').map((line, i) => {
                          let color = 'text-gray-400';
                          let bgColor = 'bg-transparent';
                          if (line.startsWith('+')) {
                            color = 'text-green-400';
                            bgColor = 'bg-green-950/30';
                          } else if (line.startsWith('-')) {
                            color = 'text-red-400';
                            bgColor = 'bg-red-950/30';
                          } else if (line.startsWith('@@')) {
                            color = 'text-blue-400';
                          }
                          
                          return <div key={i} className={`${color} ${bgColor} px-1`}>{line}</div>;
                        })}
                      </pre>
                    </div>
                  </div>
                  
                  {applyResult && (
                    <div className={`mt-2 p-4 rounded border ${applyResult.status === 'SYSTEM HEALED' ? 'bg-green-950/50 border-green-900/50' : 'bg-red-950/50 border-red-900/50'}`}>
                      <h3 className={`text-xs uppercase tracking-widest font-bold mb-2 flex items-center gap-2 ${applyResult.status === 'SYSTEM HEALED' ? 'text-green-500' : 'text-red-500'}`}>
                        {applyResult.status === 'SYSTEM HEALED' && <span className="w-2 h-2 bg-green-500 rounded-full"></span>}
                        {applyResult.status}
                      </h3>
                      <p className="text-xs text-gray-300 mb-3">{applyResult.message}</p>
                      
                      {applyResult.validationResult && (
                        <div className="mt-4 pt-4 border-t border-gray-800/50">
                          <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2 tracking-widest">Test Summary</h4>
                          <pre className="text-[10px] font-mono bg-gray-950 p-3 rounded border border-gray-800 overflow-x-auto max-h-48 text-gray-400">
                            {applyResult.validationResult.stdout || applyResult.validationResult.stderr || 'No output'}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {repairData && !loadingRepair && (
              <div className="flex-shrink-0 p-4 border-t border-gray-800 bg-gray-900 flex justify-end gap-3 sticky bottom-0">
                <button 
                  onClick={() => setRepairPanelOpen(false)}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-white transition"
                >
                  Dismiss
                </button>
                <button 
                  onClick={handleApplyPatch}
                  disabled={applyingPatch || (applyResult && applyResult.status === 'SYSTEM HEALED')}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold uppercase tracking-wide rounded shadow-sm disabled:opacity-50 flex items-center gap-2 transition"
                >
                  {applyingPatch ? (
                    <>
                      <Activity className="animate-spin" size={14} />
                      Applying & Validating...
                    </>
                  ) : applyResult && applyResult.status === 'REPAIR FAILED' ? (
                    'Retry Patch'
                  ) : applyResult && applyResult.status === 'SYSTEM HEALED' ? (
                    'Applied Successfully'
                  ) : (
                    'Apply Patch & Validate'
                  )}
                </button>
              </div>
            )}
          </div>
        )}

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

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowContent />
    </ReactFlowProvider>
  );
}
