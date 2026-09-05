import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Activity, Database, Server, Box, GitMerge, AlertCircle, Info, Zap, AlertTriangle, RefreshCw, Wrench, Layers, Monitor, Hexagon, Lock, Search, Download, X, FlaskConical } from 'lucide-react';
import CrossSectionNode from './components/CrossSectionNode';
import PipelineScene3D from './components/PipelineScene3D';
import ParticleWave from './components/ParticleWave';
import { layoutGraph } from './lib/layoutGraph';
import { toReactFlowGraph } from './lib/toReactFlowGraph';
import { DEMO_NODES, DEMO_EDGES, DEMO_META } from './lib/demoData.js';
import { exportJSON, exportMarkdown } from './lib/exportReport.js';

const getApiUrl = (endpoint) => {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  if (!baseUrl) {
    return endpoint;
  }
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${cleanBase}/${cleanEndpoint}`;
};

const getAnalysisApiUrl = (endpoint) => {
  const baseUrl = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:3001';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${cleanBase}/${cleanEndpoint}`;
};

function HighlightText({ text, search }) {
  if (!text || typeof text !== 'string') return text || null;
  if (!search || !search.trim()) return text;

  const query = search.trim();
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={index}
            style={{
              backgroundColor: '#facc15',
              color: '#09090b',
              padding: '0 2px',
              borderRadius: '2px',
              fontWeight: 'bold',
              boxShadow: '0 0 6px rgba(250, 204, 21, 0.6)'
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

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
            <HighlightText text={data.label} search={data.searchTerm} />
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
            <HighlightText text={data.label} search={data.searchTerm} />
            {isImpacted && !isTarget && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mt-0.5">
            {isTarget ? 'Target Infrastructure' : isImpacted ? 'Impacted Infrastructure' : 'Infrastructure'}
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
  crossSection: CrossSectionNode,
};

function FlowContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = useState('connecting');

  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [repairData, setRepairData] = useState(null);
  const [loadingRepair, setLoadingRepair] = useState(false);
  const [repairPanelOpen, setRepairPanelOpen] = useState(false);
  const [applyingPatch, setApplyingPatch] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [fixingNode, setFixingNode] = useState(false);
  const [fixResult, setFixResult] = useState(null);

  /* ── Repo Analysis State ── */
  const [repoUrl, setRepoUrl] = useState('https://github.com/expressjs/morgan');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState('');
  const [analyzePct, setAnalyzePct] = useState(0);
  const [showFullGraph, setShowFullGraph] = useState(false);
  const rawAnalysisRef = React.useRef({ nodes: [], edges: [], positions: {}, impacted: new Set() });
  // analysisSnapshot is a real React state copy — changes trigger re-renders in PipelineScene3D
  const [analysisSnapshot, setAnalysisSnapshot] = React.useState(null);

  /* ── CrossSection global axis mode ── */
  const [csAxisMode, setCsAxisMode] = useState('collapsed');

  /* ── Main View Mode ── */
  const [viewMode, setViewMode] = useState('graph'); // 'graph' or '3d'

  /* ── Graph Search ── */
  const [graphSearch, setGraphSearch] = useState('');
  const searchInputRef = useRef(null);

  /* ── Demo mode ── */
  const [isDemo, setIsDemo] = useState(false);

  /* ── Mascot Welcome Video (First visit of the day or cache cleared) ── */
  const [showMascot, setShowMascot] = useState(false);

  useEffect(() => {
    try {
      const lastVisit = localStorage.getItem('latenttwin_last_visit');
      const today = new Date().toDateString();
      if (!lastVisit || lastVisit !== today) {
        setShowMascot(true);
        localStorage.setItem('latenttwin_last_visit', today);
      }
    } catch (err) {
      console.warn('localStorage not accessible:', err);
    }
  }, []);

  const syncReactFlow = useCallback(() => {
    const raw = rawAnalysisRef.current;
    if (raw.nodes.length === 0) return;
    const { rfNodes, rfEdges } = toReactFlowGraph(
      raw.nodes, raw.edges, raw.positions, csAxisMode, raw.impacted, showFullGraph
    );
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [csAxisMode, showFullGraph, setNodes, setEdges]);

  /* Sync global axis mode into all crossSection node data */
  useEffect(() => {
    // We can just call syncReactFlow if raw data exists, else fallback to standard
    if (rawAnalysisRef.current.nodes.length > 0) {
      syncReactFlow();
    } else {
      setNodes((prev) =>
        prev.map((n) =>
          n.type === 'crossSection'
            ? { ...n, data: { ...n.data, axisMode: csAxisMode } }
            : n
        )
      );
    }
  }, [csAxisMode, showFullGraph, syncReactFlow]);

  const { fitView } = useReactFlow();

  /* ── Navigate to impacted nodes ── */
  const fitImpacted = useCallback(() => {
    const raw = rawAnalysisRef.current;
    const impactedIds = [...raw.impacted];
    if (impactedIds.length > 0) {
      fitView({ duration: 700, padding: 0.3, nodes: impactedIds.map(id => ({ id })) });
    } else {
      fitView({ duration: 700, padding: 0.15 });
    }
  }, [fitView]);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const [response] = await Promise.all([
          fetch(getApiUrl('/api/graph')),
          new Promise(r => setTimeout(r, 1200)) // ensure cool loading plays
        ]);
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

        /* Add a CrossSection node anchored below the main graph */
        rfNodes.push({
          id: 'cross-section-auth',
          type: 'crossSection',
          position: { x: 100, y: 420 },
          data: {
            label: 'auth-service',
            status: 'impacted',
            impact: 'user_id → userId mismatch',
          },
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

  const handleAnalyzeRepo = async () => {
    if (!repoUrl) return;
    setIsDemo(false);
    setAnalyzing(true);
    setAnalyzeStage('Starting...');
    setAnalyzePct(0);
    try {
      const response = await fetch(getAnalysisApiUrl('/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, bugInput: { type: 'fullScan' } })
      });
      if (!response.ok) throw new Error('Failed to start analysis');
      const { jobId } = await response.json();

      const eventSource = new EventSource(getAnalysisApiUrl(`/analyze/${jobId}/events`));

      eventSource.addEventListener('stage', (e) => {
        const eventData = JSON.parse(e.data);
        setAnalyzeStage(eventData.stage);
        setAnalyzePct(eventData.pct);

        if (eventData.stage === 'graphReady' && eventData.graph) {
          const raw = rawAnalysisRef.current;
          raw.nodes = eventData.graph.nodes;
          raw.edges = eventData.graph.edges;
          raw.positions = layoutGraph(raw.nodes, raw.edges);
          setAnalysisSnapshot({ nodes: raw.nodes, edges: raw.edges, impacted: raw.impacted });
          syncReactFlow();
          setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 100);
        } else if (eventData.stage === 'tiersReady' && eventData.graph?.tiers) {
          const tierMap = new Map(eventData.graph.tiers);
          const raw = rawAnalysisRef.current;
          raw.nodes = raw.nodes.map(n => ({ ...n, tier: tierMap.get(n.file) || n.tier }));
          setAnalysisSnapshot({ nodes: raw.nodes, edges: raw.edges, impacted: raw.impacted });
          syncReactFlow();
        }
      });

      eventSource.addEventListener('done', async (e) => {
        eventSource.close();
        const res = await fetch(getAnalysisApiUrl(`/analyze/${jobId}/result`));
        const data = await res.json();

        const raw = rawAnalysisRef.current;
        raw.nodes = data.nodes;
        raw.edges = data.edges;
        raw.impacted = new Set(data.nodes.filter(n => n.status === 'impacted').map(n => n.id));
        raw.positions = layoutGraph(raw.nodes, raw.edges);

        setAnalysisSnapshot({ nodes: raw.nodes, edges: raw.edges, impacted: raw.impacted });
        syncReactFlow();
        setAnalyzing(false);
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 200);
      });

      eventSource.addEventListener('error', (e) => {
        eventSource.close();
        setAnalyzing(false);
        try {
          const eventData = JSON.parse(e.data);
          const msg = eventData.message || '';
          // Auth/rate-limit errors — show a clear actionable message, NOT a premium redirect
          if (msg.includes('rate limit') || msg.includes('403') || msg.includes('401') || msg.includes('authentication failed')) {
            alert('GitHub API error: ' + msg);
          // Large-repo errors → premium gate
          } else if (
            msg.includes('exceeds the configured limit') ||
            msg.includes('too large') ||
            msg.includes('local Git cloning') ||
            msg.includes('Premium Subscription Required')
          ) {
            navigate('/premium?feature=Large+Repository+Support');
          } else {
            alert('Analysis error: ' + msg);
          }
        } catch {
          // connection error (onerror), not a payload error
        }
      });

      eventSource.onerror = () => {
        eventSource.close();
        setAnalyzing(false);
      };
    } catch (e) {
      console.error(e);
      setAnalyzing(false);
      alert('Could not start analysis');
    }
  };

  /* ── Feature C: Demo Mode ── */
  const loadDemo = useCallback(() => {
    const raw = rawAnalysisRef.current;
    raw.nodes = DEMO_NODES;
    raw.edges = DEMO_EDGES;
    raw.impacted = new Set(DEMO_NODES.filter(n => n.status === 'impacted').map(n => n.id));
    raw.positions = layoutGraph(DEMO_NODES, DEMO_EDGES);

    setAnalysisSnapshot({ nodes: raw.nodes, edges: raw.edges, impacted: raw.impacted });
    syncReactFlow();
    setIsDemo(true);
    setGraphSearch('');
    setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 200);
  }, [syncReactFlow, fitView]);

  const handleSimulateBreak = async () => {
    setSimulating(true);
    setRepairPanelOpen(false);
    setRepairData(null);

    // In demo mode, run purely client-side — no API call needed
    if (isDemo) {
      // The demo nodes that are broken / downstream
      const affectedIds = [
        'auth-service/index.ts',
        'event-queue/queue.ts',
        'event-queue/schema.ts',
        'worker-service/processor.ts',
      ];
      const targetId = 'auth-service/index.ts';
      const pathNodes = [
        'auth-service/index.ts',
        'event-queue/queue.ts',
        'worker-service/processor.ts',
      ];

      const demoSimResult = {
        target: targetId,
        affectedNodes: affectedIds,
        dependencyPath: pathNodes,
        relevantInvariants: [
          { pr: 'PR#42', description: 'Field renames must propagate to all consumers before merge.' },
          { pr: 'PR#61', description: 'Event schema types must match producer payload shape.' },
        ],
      };
      setSimulationResult(demoSimResult);

      const affectedSet = new Set(affectedIds);
      const pathEdgeSet = new Set();
      for (let i = 0; i < pathNodes.length - 1; i++) {
        pathEdgeSet.add(`${pathNodes[i]}->${pathNodes[i + 1]}`);
      }

      // Phase 1: Mark affected nodes red / open in Z-depth
      setNodes(prevNodes =>
        prevNodes.map(node => ({
          ...node,
          zIndex: affectedSet.has(node.id) ? 20 : node.zIndex ?? 0,
          data: {
            ...node.data,
            status: affectedSet.has(node.id)
              ? (node.id === targetId ? 'impacted' : 'affected-downstream')
              : node.data.status,
            axisMode: affectedSet.has(node.id) ? 'z' : node.data.axisMode,
          },
        }))
      );

      // Highlight the blast-radius edges red
      setEdges(prevEdges =>
        prevEdges.map(edge => {
          const isBlastPath = pathEdgeSet.has(edge.id);
          return isBlastPath
            ? { ...edge, animated: true, style: { stroke: '#ef4444', strokeWidth: 3.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' } }
            : edge;
        })
      );

      setTimeout(() => fitView({ padding: 0.2, duration: 800, nodes: pathNodes.map(id => ({ id })) }), 150);

      // Phase 2 (auto-repair): after 2.8s, resolve all broken nodes one-by-one
      setTimeout(() => {
        // Mark all affected nodes as resolved
        setNodes(prevNodes =>
          prevNodes.map(node => {
            if (!affectedSet.has(node.id)) return node;
            return {
              ...node,
              zIndex: 20,
              data: {
                ...node.data,
                status: 'resolved',
                axisMode: 'z',
                // Mark all error lines as resolved inside each card
                layers: node.data.layers?.map(layer => ({
                  ...layer,
                  lines: layer.lines?.map(line => ({
                    ...line,
                    status: line.error ? 'resolved' : line.status,
                    error: false,
                  })),
                })),
              },
            };
          })
        );
        // Turn blast-radius edges green
        setEdges(prevEdges =>
          prevEdges.map(edge => {
            const wasBlastPath = pathEdgeSet.has(edge.id);
            return wasBlastPath
              ? { ...edge, animated: true, style: { stroke: '#34d399', strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#34d399' } }
              : edge;
          })
        );
        // Mark the overall repair as successful
        setApplyResult({ status: 'SYSTEM HEALED', output: 'All field references updated. Tests passing.' });
        setSimulationResult(null);
        setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 150);
      }, 2800);

      setSimulating(false);
      return;
    }

    // Non-demo: call real API
    try {
      const response = await fetch(getApiUrl('/api/simulate-break'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'auth-service', change: 'rename user_id to userId' })
      });
      if (!response.ok) throw new Error('Simulation failed');
      const data = await response.json();
      setSimulationResult(data);

      const affectedSet = new Set(data.affectedNodes || []);
      const pathNodes = data.dependencyPath || [];
      const pathEdgeSet = new Set();
      for (let i = 0; i < pathNodes.length - 1; i++) {
        pathEdgeSet.add(`${pathNodes[i]}->${pathNodes[i + 1]}`);
      }

      setNodes(prevNodes =>
        prevNodes.map(node => ({
          ...node,
          data: { ...node.data, isImpacted: affectedSet.has(node.id), isTarget: node.id === data.target }
        }))
      );
      setEdges(prevEdges =>
        prevEdges.map(edge => {
          const isBlastPath = pathEdgeSet.has(edge.id);
          return isBlastPath
            ? { ...edge, animated: true, style: { stroke: '#ef4444', strokeWidth: 3.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' } }
            : edge;
        })
      );
      setTimeout(() => fitView({ padding: 0.2, duration: 800, nodes: pathNodes.map(id => ({ id })) }), 100);
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
    setApplyResult(null);

    // In demo mode: restore from DEMO data via syncReactFlow
    if (isDemo) {
      const raw = rawAnalysisRef.current;
      raw.nodes = DEMO_NODES;
      raw.edges = DEMO_EDGES;
      raw.impacted = new Set(DEMO_NODES.filter(n => n.status === 'impacted').map(n => n.id));
      raw.positions = layoutGraph(DEMO_NODES, DEMO_EDGES);
      syncReactFlow();
      setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 150);
      return;
    }

    // Non-demo: restore from raw analysis ref or graphData
    const raw = rawAnalysisRef.current;
    if (raw.nodes.length > 0) {
      syncReactFlow();
    } else if (graphData) {
      setNodes(prevNodes =>
        prevNodes.map(node => ({
          ...node,
          data: { ...node.data, isImpacted: false, isTarget: false }
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
          markerEnd: { type: MarkerType.ArrowClosed, color: isImplicit ? '#f59e0b' : '#94a3b8' },
          data: { type: edge.type, relationshipType: edge.relationshipType }
        };
      }));
    }
    setTimeout(() => fitView({ padding: 0.1, duration: 800 }), 100);
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
    if (!simulationResult) return;
    setLoadingRepair(true);
    setRepairPanelOpen(true);
    setRepairData(null);
    try {
      const response = await fetch(getApiUrl('/api/repair'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: simulationResult.target || 'auth-service',
          change: simulationResult.change || 'rename user_id to userId'
        })
      });
      if (!response.ok) throw new Error('Repair generation failed');
      const data = await response.json();
      setRepairData(data);
    } catch (err) {
      console.error('Error generating repair:', err);
      setRepairPanelOpen(false);
    } finally {
      setLoadingRepair(false);
    }
  };

  const handleApplyPatch = async () => {
    setApplyingPatch(true);
    setApplyResult(null);
    try {
      const response = await fetch(getApiUrl('/api/apply-patch'), {
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

  /* ── Feature A: Search-filtered node view ── */
  // Derive display nodes with dimmed opacity for non-matches. No graph remount.
  const searchTerm = graphSearch.trim().toLowerCase();
  const displayNodes = useMemo(() => {
    if (!searchTerm) return nodes;
    return nodes.map(n => {
      let codeHaystack = [];
      if (n.data?.lines) {
        codeHaystack = n.data.lines.flatMap(l => [l.code, l.before, l.after, l.hint]);
      }
      if (n.data?.layers) {
        n.data.layers.forEach(layer => {
          codeHaystack.push(layer.title, layer.file);
          if (layer.lines) {
             layer.lines.forEach(l => {
               codeHaystack.push(l.code, l.before, l.after, l.hint);
             });
          }
        });
      }

      const hay = [
        n.id, n.data?.label, n.data?.file, n.data?.role, n.data?.tier, n.data?.status, n.type, ...codeHaystack
      ].filter(Boolean).join(' ').toLowerCase();
      const matches = hay.includes(searchTerm);
      return {
        ...n,
        data: {
          ...n.data,
          searchTerm,
        },
        style: {
          ...n.style,
          opacity: matches ? 1 : 0.15,
          transition: 'opacity 0.2s',
        },
      };
    });
  }, [nodes, searchTerm]);

  // Focus viewport on first match when user presses Enter
  const handleSearchEnter = useCallback((e) => {
    if (e.key === 'Escape') { setGraphSearch(''); return; }
    if (e.key !== 'Enter' || !searchTerm) return;
    const hit = nodes.find(n => {
      let codeHaystack = [];
      if (n.data?.lines) {
        codeHaystack = n.data.lines.flatMap(l => [l.code, l.before, l.after, l.hint]);
      }
      if (n.data?.layers) {
        n.data.layers.forEach(layer => {
          codeHaystack.push(layer.title, layer.file);
          if (layer.lines) {
             layer.lines.forEach(l => {
               codeHaystack.push(l.code, l.before, l.after, l.hint);
             });
          }
        });
      }
      const hay = [n.id, n.data?.label, n.data?.file, n.data?.role, n.data?.tier, ...codeHaystack].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchTerm);
    });
    if (hit) fitView({ duration: 600, padding: 0.3, nodes: [{ id: hit.id }] });
  }, [nodes, searchTerm, fitView]);

  const handleGoHome = useCallback(() => {
    setIsDemo(false);
    setSimulationResult(null);
    setRepairData(null);
    setRepairPanelOpen(false);
    setApplyResult(null);
    setSelectedNode(null);
    setGraphSearch('');
    setAnalysisSnapshot(null);
    rawAnalysisRef.current = { nodes: [], edges: [], positions: {}, impacted: new Set() };
    navigate('/');
    window.location.href = '/';
  }, [navigate]);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-950 font-sans">
      {/* Cinematic wave breathing background aura moved inside graph canvas */}
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-xl px-6 shrink-0 z-50 sticky top-0 shadow-sm">
        {/* Left: Brand with animated mascot logo on first visit of the day */}
        <div
          onClick={handleGoHome}
          className="flex items-center gap-3.5 shrink-0 cursor-pointer group"
          title="Return to Home"
        >
          {showMascot ? (
            <video
              src="/mascot_anim.mp4"
              autoPlay
              muted
              playsInline
              onEnded={() => setShowMascot(false)}
              className="w-11 h-11 object-cover rounded-xl shadow-lg shadow-blue-500/20 overflow-hidden group-hover:scale-105 transition-transform"
            />
          ) : (
            <img src="/logo.png" alt="LatentTwin Logo" className="w-11 h-11 object-contain rounded-xl shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform" />
          )}
          <h1 className="text-xl font-bold bg-gradient-to-r from-gray-100 to-gray-400 bg-clip-text text-transparent tracking-tight pr-6 border-r border-gray-800/60 hidden md:block group-hover:from-white group-hover:to-gray-200 transition-colors">
            LatentTwin
          </h1>
        </div>

        {/* Center: Repo URL bar + Demo button */}
        <div className="flex items-center justify-start flex-1 gap-2 ml-6">
          <div className="flex items-center bg-gray-900/90 p-1 rounded-md border border-gray-800 shadow-sm w-full max-w-md focus-within:border-blue-500/60 focus-within:ring-1 focus-within:ring-blue-500/40 transition-all">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="Paste GitHub repository URL..."
              className="bg-transparent text-xs text-gray-200 px-3 py-1 w-full focus:outline-none placeholder-gray-500 font-mono"
              disabled={analyzing}
            />
            <button
              onClick={handleAnalyzeRepo}
              disabled={analyzing || !repoUrl}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-1 rounded transition-all disabled:opacity-50 disabled:hover:bg-blue-600 shrink-0"
            >
              {analyzing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scanning
                </>
              ) : (
                'Auto-Scan'
              )}
            </button>
          </div>
          {/* Demo button — hidden after demo is loaded, replaced by DEMO badge */}
          {!isDemo && (
            <div className="relative flex items-center shrink-0">
              <button
                id="try-demo-btn"
                onClick={loadDemo}
                disabled={analyzing}
                title="Load a pre-analyzed demo without GitHub credentials"
                className="flex items-center gap-1.5 bg-emerald-900/50 hover:bg-emerald-800/70 border border-emerald-700/50 hover:border-emerald-600 text-emerald-400 hover:text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-md transition-all shrink-0 disabled:opacity-40 shadow-sm"
              >
                <FlaskConical size={12} />
                Try Demo
              </button>

              {/* Tooltip on the right side of "Try Demo" — shown before user clicks */}
              <div className="absolute left-full top-1/2 ml-2.5 px-2.5 py-1 bg-indigo-950/90 text-indigo-200 text-[10px] font-medium rounded-md border border-indigo-500/40 whitespace-nowrap shadow-lg shadow-indigo-950/40 animate-gentle-tooltip pointer-events-none z-50 flex items-center gap-1 backdrop-blur-md">
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-indigo-950/90" />
                Click here to see how it works
              </div>
            </div>
          )}

          {/* Demo mode badge — replaces the Try Demo button after click */}
          {isDemo && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-md animate-fade-in">
              DEMO
            </span>
          )}
        </div>

        {/* Right: Controls & Status */}
        <div className="flex items-center justify-end gap-3 shrink-0">
          {/* Feature B: Export Report bar — only shown when scan data exists */}
          {analysisSnapshot && !analyzing && (
            <div className="flex items-center gap-1.5 bg-gray-900/60 p-1 rounded-lg border border-gray-800/60 shadow-inner mr-2">
              <Download size={12} className="text-gray-500 ml-1.5" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mr-1 hidden lg:inline">Export</span>
              <button
                id="export-json-btn"
                onClick={() => exportJSON(analysisSnapshot, repoUrl)}
                className="text-[10px] font-semibold text-sky-400 hover:text-white bg-sky-500/10 hover:bg-sky-600/30 border border-sky-500/20 hover:border-sky-500/50 px-2 py-1 rounded transition-all"
              >
                JSON
              </button>
              <button
                id="export-md-btn"
                onClick={() => exportMarkdown(analysisSnapshot, repoUrl)}
                className="text-[10px] font-semibold text-violet-400 hover:text-white bg-violet-500/10 hover:bg-violet-600/30 border border-violet-500/20 hover:border-violet-500/50 px-2 py-1 rounded transition-all"
              >
                Markdown
              </button>
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-900/60 p-1 rounded-lg border border-gray-800/60 shadow-inner">
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                viewMode === 'graph' 
                  ? 'bg-gray-800 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Monitor size={14} /> Graph
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                viewMode === '3d' 
                  ? 'bg-indigo-600/90 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Hexagon size={14} /> 3D
            </button>
          </div>

          <div className="h-6 w-px bg-gray-800/60"></div>

          {/* API Status */}
          <div className="flex items-center">
            {backendStatus === 'connected' ? (
              <span className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-2.5 py-1.5 rounded-md text-xs font-medium border border-emerald-400/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                API
              </span>
            ) : backendStatus === 'connecting' ? (
              <span className="flex items-center gap-2 text-amber-400 bg-amber-400/10 px-2.5 py-1.5 rounded-md text-xs font-medium border border-amber-400/20">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                API
              </span>
            ) : (
              <span className="flex items-center gap-2 text-rose-400 bg-rose-400/10 px-2.5 py-1.5 rounded-md text-xs font-medium border border-rose-400/20">
                <span className="w-2 h-2 bg-rose-500 rounded-full"></span>
                API
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {viewMode === '3d' ? (
          <PipelineScene3D analysisData={analysisSnapshot} />
        ) : (
          <>
            {/* Graph Canvas */}
            <div className="flex-1 h-full bg-grid-pattern relative">

          {/* CrossSection global axis-mode toggle bar */}
          {!loading && (
            <div
              className="absolute top-3 left-1/2 z-30 flex items-center gap-1 bg-gray-900/90 border border-gray-700 rounded-lg px-2 py-1.5 shadow-xl backdrop-blur-sm"
              style={{ transform: 'translateX(-50%)' }}
            >
              <Layers size={12} className="text-sky-400 mr-1" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mr-2">Cross-Section</span>
              {['collapsed', 'z', 'y', 'x'].map((m) => (
                <button
                  key={m}
                  onClick={() => setCsAxisMode(m)}
                  title={`Set all CrossSection nodes to ${m} axis`}
                  className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
                    csAxisMode === m
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                      : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700'
                  }`}
                >
                  {m === 'collapsed' ? '⊟ Collapse' : m === 'z' ? 'Z Depth' : m === 'y' ? 'Y Stack' : 'X Flow'}
                </button>
              ))}
            </div>
          )}

          {/* Floating navigation toolbar — zoom, fit-all, focus impacted */}
          {!loading && (
            <div className="absolute bottom-6 left-1/2 z-30 flex items-center gap-1.5 bg-gray-900/95 border border-gray-700/80 rounded-xl px-2 py-1.5 shadow-2xl backdrop-blur-md" style={{ transform: 'translateX(-50%)' }}>
              {/* Zoom out */}
              <button
                onClick={() => fitView({ duration: 400, padding: 0.05, minZoom: 0.05, maxZoom: 0.5 })}
                title="Zoom out to overview"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:bg-gray-800/80 transition-all uppercase tracking-wider"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                Zoom Out
              </button>
              <div className="w-px h-4 bg-gray-700" />
              {/* Fit all */}
              <button
                onClick={() => fitView({ duration: 600, padding: 0.15 })}
                title="Fit entire graph"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:bg-gray-800/80 transition-all uppercase tracking-wider"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9V5a2 2 0 0 1 2-2h4M3 15v4a2 2 0 0 0 2 2h4m10-16h4a2 2 0 0 1 2 2v4m0 10v4a2 2 0 0 1-2 2h-4"/></svg>
                Fit All
              </button>
              <div className="w-px h-4 bg-gray-700" />
              {/* Focus impacted */}
              <button
                onClick={fitImpacted}
                title="Zoom to impacted nodes"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-all uppercase tracking-wider border border-transparent hover:border-red-800/40"
              >
                <AlertCircle size={11} />
                Focus Impacted
              </button>
              <div className="w-px h-4 bg-gray-700" />
              {/* Show full graph toggle */}
              <button
                onClick={() => setShowFullGraph(v => !v)}
                title={showFullGraph ? 'Show focused neighborhood' : 'Show full dependency graph'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider ${
                  showFullGraph
                    ? 'text-indigo-300 bg-indigo-900/30 border border-indigo-700/40'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/80'
                }`}
              >
                <Box size={11} />
                {showFullGraph ? 'Full Graph' : 'Focused'}
              </button>
            </div>
          )}

          {/* Feature A: Graph Search Overlay */}
          {!loading && nodes.length > 0 && (
            <div
              className="absolute top-3 right-16 z-30 flex items-center gap-1.5"
              style={{ minWidth: 220 }}
            >
              <div className="flex items-center gap-2 bg-gray-900/95 border border-gray-700/80 rounded-lg px-2.5 py-1.5 shadow-xl backdrop-blur-md w-full focus-within:border-blue-500/60 transition-all">
                <Search size={11} className="text-gray-500 shrink-0" />
                <input
                  id="graph-search-input"
                  ref={searchInputRef}
                  type="text"
                  value={graphSearch}
                  onChange={e => setGraphSearch(e.target.value)}
                  onKeyDown={handleSearchEnter}
                  placeholder="Search nodes..."
                  className="bg-transparent text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none w-full font-mono"
                />
                {graphSearch && (
                  <button
                    onClick={() => setGraphSearch('')}
                    className="text-gray-500 hover:text-white transition-colors shrink-0"
                    title="Clear search (Esc)"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              {graphSearch && (
                <span className="text-[10px] text-gray-500 font-mono shrink-0 whitespace-nowrap">
                  {displayNodes.filter(n => (n.style?.opacity ?? 1) === 1).length} match
                </span>
              )}
            </div>
          )}


          {/* Scanning overlay — full-screen particle wave */}
          {analyzing && <ParticleWave />}

          {loading ? (
            <ParticleWave />
          ) : (

            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.03}
              maxZoom={2}
              className="bg-transparent"
              colorMode="dark"
              onlyRenderVisibleElements
            >
              <Background color="#334155" gap={20} size={1} />
              <Controls
                position="top-right"
                className="bg-gray-800 border-gray-700 text-gray-300 fill-gray-300 shadow-xl"
                style={{ zIndex: 50 }}
                showInteractive={false}
              />
              <MiniMap
                nodeStrokeColor={(n) => {
                  const s = n.data?.status;
                  if (s === 'impacted') return '#f87171';
                  if (s === 'affected-downstream') return '#fb923c';
                  if (n.type === 'service') return '#3b82f6';
                  return '#64748b';
                }}
                nodeColor={(n) => {
                  const s = n.data?.status;
                  if (s === 'impacted') return '#450a0a';
                  if (s === 'affected-downstream') return '#431407';
                  return '#0f172a';
                }}
                maskColor="rgba(5, 10, 25, 0.85)"
                className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl"
                position="bottom-right"
                zoomable
                pannable
                style={{ width: 180, height: 120 }}
              />
            </ReactFlow>
          )}
        </div>

        {/* Left Side Navigation / State / Overlay */}
        <div className="absolute top-6 bottom-20 left-6 z-20 flex flex-col gap-3 w-72 max-h-full pointer-events-none pb-2">
          {/* Scrollable card stack — no overlap */}
          <div className="flex flex-col gap-3 overflow-y-auto hide-scrollbar" style={{maxHeight: '100%'}}>

          {/* Inject Breaking Change Control — shown in both demo and real mode */}
          {(isDemo || nodes.length > 0) && (
            <div className="bg-gray-900/95 border border-gray-800 p-3.5 rounded-xl shadow-xl pointer-events-auto shrink-0 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Zap size={13} className="text-amber-500" /> Simulator
                </span>
                {simulationResult && (
                  <button
                    onClick={handleResetSimulation}
                    className="text-[10px] uppercase font-bold tracking-wider text-gray-400 hover:text-white flex items-center gap-1 bg-gray-800 px-2 py-1 rounded border border-gray-700 transition"
                  >
                    <RefreshCw size={11} /> Reset
                  </button>
                )}
              </div>

              <button
                onClick={handleSimulateBreak}
                disabled={simulating}
                className="w-full bg-gradient-to-r from-amber-600/80 to-orange-600/80 hover:from-amber-500 hover:to-orange-500 text-white font-semibold text-[11px] uppercase tracking-wide py-2 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 border border-amber-500/30 disabled:opacity-50"
              >
                {simulating ? (
                  <><RefreshCw size={13} className="animate-spin text-amber-300" /><span>Simulating Break...</span></>
                ) : (
                  <><AlertTriangle size={13} /><span>Inject Breaking Change</span></>
                )}
              </button>
            </div>
          )}

          {/* Blast Radius Summary Card */}
          {simulationResult && applyResult?.status !== 'SYSTEM HEALED' && (
            <div className="bg-red-950/90 border border-red-900/50 p-3.5 rounded-xl shadow-xl animate-fade-in flex flex-col gap-3 pointer-events-auto shrink-0 backdrop-blur-sm">
              <div className="flex flex-col gap-1 border-b border-red-900/50 pb-2.5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="text-red-500 shrink-0" size={14} />
                  <h2 className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                    Critical Error
                  </h2>
                </div>
                <div className="font-mono text-[11px] text-red-200 mt-0.5 pl-5">
                  Type mismatch: user_id → userId
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Blast Radius
                </h3>
                <div className="flex flex-col gap-1">
                  {simulationResult.affectedNodes
                    ?.filter(nodeId => nodeId !== simulationResult.target)
                    .map(nodeId => {
                      const nodeObj = nodes.find(n => n.id === nodeId);
                      const name = nodeObj ? nodeObj.data.name : nodeId;
                      return (
                        <div key={nodeId} className="flex items-center gap-2 text-[11px] text-red-300 bg-red-900/20 border border-red-900/30 px-2 py-1 rounded font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                          <span>{name}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {simulationResult.relevantInvariants && simulationResult.relevantInvariants.length > 0 && (
                <div className="border-t border-red-900/50 pt-2.5">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <GitMerge size={11} className="text-gray-400" /> Invariants
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {simulationResult.relevantInvariants.map((inv, idx) => (
                      <div key={idx} className="bg-gray-900/60 border border-gray-800 px-2 py-1.5 rounded text-[11px] text-gray-400 leading-relaxed">
                        <span className="font-mono text-gray-500 mr-1.5">{inv.pr}</span>
                        <span>{inv.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {simulationResult.relevantInvariants && simulationResult.relevantInvariants.length > 0 && (
                <div className="border-t border-red-900/50 pt-2">
                  <button
                    onClick={handleGenerateRepair}
                    disabled={loadingRepair}
                    className="w-full bg-gradient-to-r from-blue-600/80 to-indigo-600/80 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-[11px] uppercase tracking-wide py-2 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 border border-blue-500/30 disabled:opacity-50"
                  >
                    {loadingRepair ? (
                      <><Activity size={13} className="animate-spin" /><span>Synthesizing Patch...</span></>
                    ) : (
                      <><Wrench size={13} /><span>Generate Repair</span></>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          </div>{/* end scrollable stack */}
        </div>

        {/* Dependency Types Legend — fixed floating hover card, bottom-left, compact by default */}
        {(isDemo || analysisSnapshot) && (
          <div className="absolute bottom-6 left-6 z-30 pointer-events-auto group">
            {/* Compact pill — always visible */}
            <div className="flex items-center gap-2 bg-gray-900/80 border border-gray-800/80 px-3 py-1.5 rounded-lg backdrop-blur-sm shadow-lg cursor-default transition-all duration-300">
              <div className="w-4 h-px bg-gray-500"></div>
              <div className="w-4 border-b border-dashed border-gray-500"></div>
              {simulationResult && <div className="w-4 h-px bg-red-500"></div>}
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Legend</span>
            </div>
            {/* Expanded card — slides up on hover */}
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-900/95 border border-gray-800 p-3.5 rounded-xl shadow-2xl backdrop-blur-sm
                            opacity-0 translate-y-2 pointer-events-none
                            group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto
                            transition-all duration-200 ease-out">
              <h3 className="text-[10px] font-bold text-gray-500 mb-2.5 uppercase tracking-widest">Dependency Types</h3>
              <div className="flex flex-col gap-2.5 text-xs font-medium">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-px bg-gray-400 shrink-0"></div>
                  <span className="text-gray-400">Explicit Call</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 border-b-2 border-dashed border-gray-500 shrink-0"></div>
                  <span className="text-gray-400">Implicit Event</span>
                </div>
                {simulationResult && (
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
                    <div className="w-6 h-px bg-red-500 shrink-0"></div>
                    <span className="text-red-400">Blast Radius</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
                <ParticleWave />
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

        {selectedNode && (() => {
          const nd = selectedNode.data;
          const bugLines = (nd.layers ?? []).flatMap(l => (l.lines ?? []).filter(l => l.error));
          const allLines = (nd.layers ?? []).flatMap(l => (l.lines ?? []));
          const isImpacted = nd.status === 'impacted' || nd.status === 'affected-downstream';
          const outEdges = edges.filter(e => e.source === selectedNode.id);
          const inEdges = edges.filter(e => e.target === selectedNode.id);
          return (
            <div className="w-[420px] border-l border-gray-800 bg-gray-900 overflow-y-auto flex flex-col shadow-2xl z-20">
              {/* Header */}
              <div className={`p-4 border-b flex items-start justify-between ${
                isImpacted ? 'border-red-900/60 bg-red-950/30' : 'border-gray-800 bg-gray-800/40'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    nd.status === 'impacted' ? 'bg-red-500/20 text-red-400' :
                    nd.status === 'affected-downstream' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-sky-500/20 text-sky-400'
                  }`}>
                    <AlertCircle size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white truncate">{nd.label || nd.file?.split('/').pop()}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                        nd.status === 'impacted' ? 'bg-red-500/20 text-red-400' :
                        nd.status === 'affected-downstream' ? 'bg-orange-500/20 text-orange-400' :
                        nd.status === 'context' ? 'bg-gray-700 text-gray-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>{nd.status || 'healthy'}</span>
                      {nd.tier && <span className="text-[10px] text-gray-500 font-mono">{nd.tier}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSelectedNode(null); setFixResult(null); }} className="text-gray-600 hover:text-white transition shrink-0 ml-2">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-0 overflow-y-auto">
                {/* File path */}
                {nd.file && (
                  <div className="px-4 py-2.5 border-b border-gray-800/60">
                    <p className="text-[10px] text-gray-500 font-mono truncate">{nd.file}</p>
                  </div>
                )}

                {/* Bug errors */}
                {bugLines.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-800/60">
                    <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <AlertCircle size={11} /> {bugLines.length} Bug{bugLines.length > 1 ? 's' : ''} Detected
                    </h3>
                    <div className="flex flex-col gap-2">
                      {bugLines.map((line, i) => (
                        <div key={i} className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                          {line.lineNumber && (
                            <p className="text-[10px] text-red-500 font-mono mb-1">Line {line.lineNumber}</p>
                          )}
                          {line.before && (
                            <pre className="text-[11px] font-mono text-red-300 bg-red-950/40 px-2 py-1 rounded mb-1 whitespace-pre-wrap break-all">{line.before}</pre>
                          )}
                          {line.hint && (
                            <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">{line.hint}</p>
                          )}
                          {line.after && (
                            <div className="mt-2">
                              <p className="text-[10px] text-emerald-500 font-bold mb-0.5">Suggested Fix:</p>
                              <pre className="text-[11px] font-mono text-emerald-300 bg-emerald-950/30 px-2 py-1 rounded whitespace-pre-wrap break-all">{line.after}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Role */}
                {nd.role && (
                  <div className="px-4 py-2.5 border-b border-gray-800/60">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Role in Bug</p>
                    <p className="text-xs text-gray-300 font-medium">{nd.role}</p>
                  </div>
                )}

                {/* Connections */}
                <div className="px-4 py-3 border-b border-gray-800/60">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Connections</h3>
                  {outEdges.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] text-gray-600 mb-1">Outgoing →</p>
                      {outEdges.map(e => {
                        const tgt = nodes.find(n => n.id === e.target);
                        const tgtStatus = tgt?.data?.status;
                        return (
                          <div key={e.id} className={`flex items-center justify-between text-xs px-2 py-1 rounded mb-1 ${
                            tgtStatus === 'impacted' ? 'bg-red-950/40 border border-red-900/40 text-red-300' :
                            tgtStatus === 'affected-downstream' ? 'bg-orange-950/30 border border-orange-900/30 text-orange-300' :
                            'bg-gray-800/50 border border-gray-800 text-gray-400'
                          }`}>
                            <span className="font-mono truncate">{tgt?.data?.label || e.target}</span>
                            {tgtStatus === 'impacted' && <AlertCircle size={10} className="text-red-500 shrink-0 ml-1" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {inEdges.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-600 mb-1">← Incoming</p>
                      {inEdges.map(e => {
                        const src = nodes.find(n => n.id === e.source);
                        const srcStatus = src?.data?.status;
                        return (
                          <div key={e.id} className={`flex items-center justify-between text-xs px-2 py-1 rounded mb-1 ${
                            srcStatus === 'impacted' ? 'bg-red-950/40 border border-red-900/40 text-red-300' :
                            srcStatus === 'affected-downstream' ? 'bg-orange-950/30 border border-orange-900/30 text-orange-300' :
                            'bg-gray-800/50 border border-gray-800 text-gray-400'
                          }`}>
                            <span className="font-mono truncate">{src?.data?.label || e.source}</span>
                            {srcStatus === 'impacted' && <AlertCircle size={10} className="text-red-500 shrink-0 ml-1" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {outEdges.length === 0 && inEdges.length === 0 && (
                    <p className="text-xs text-gray-600 italic">No connections in current view</p>
                  )}
                </div>

                {/* AI Fix result */}
                {fixResult && (
                  <div className="px-4 py-3 border-b border-gray-800/60">
                    <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Wrench size={11} /> AI Fix
                    </h3>
                    <pre className="text-[11px] font-mono text-gray-200 bg-gray-950 border border-gray-800 rounded p-3 whitespace-pre-wrap break-all overflow-auto max-h-60">{fixResult}</pre>
                  </div>
                )}
              </div>

              {/* Fix button — only for buggy nodes */}
              {bugLines.length > 0 && (
                <div className="p-4 border-t border-gray-800 bg-gray-900 shrink-0">
                  <button
                    disabled={fixingNode}
                    onClick={async () => {
                      setFixingNode(true);
                      setFixResult(null);
                      try {
                        const bugContext = bugLines.map(l =>
                          `File: ${nd.file}\nLine ${l.lineNumber ?? '?'}: ${l.before ?? l.code}\nHint: ${l.hint ?? ''}`
                        ).join('\n---\n');
                        const r = await fetch(getAnalysisApiUrl('/ai-fix'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ file: nd.file, bugs: bugLines, context: bugContext })
                        });
                        const d = await r.json();
                        if (r.status === 402 || d.error === 'premium_required') {
                          navigate('/premium?feature=AI+Autonomous+Fixing');
                          return;
                        }
                        setFixResult(d.fix || d.message || JSON.stringify(d));
                      } catch(err) {
                        setFixResult('Error: ' + err.message);
                      } finally {
                        setFixingNode(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold uppercase tracking-wide rounded-lg shadow-lg transition-all disabled:opacity-50"
                  >
                    {fixingNode ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating Fix...</>
                    ) : (
                      <><Wrench size={13} />Fix with AI</>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
          </>
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
