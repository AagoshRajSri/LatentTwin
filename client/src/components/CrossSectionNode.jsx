import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import './CrossSectionNode.css';

/* ─────────────────────────────────────────
   Static layer definitions.
   Each layer now names the actual file it maps to,
   so an impacted layer states exactly what's broken.
   ───────────────────────────────────────── */
const DEFAULT_LAYERS = [
  {
    id: 'api',
    title: 'API Entry / Routes',
    file: 'routes/auth.routes.js',
    lines: [
      { id: 'a1', code: 'POST /auth/login', error: false },
      {
        id: 'a2',
        before: 'req.body.user_id',
        after: 'req.body.userId',
        error: true,
        hint: 'Field rename: user_id → userId',
      },
      { id: 'a3', code: 'validateSchema(payload)', error: false },
    ],
  },
  {
    id: 'logic',
    title: 'Business Logic / Controller',
    file: 'controllers/authController.js',
    lines: [
      { id: 'b1', code: 'AuthController.handle()', error: false },
      {
        id: 'b2',
        before: 'const { user_id } = event',
        after: 'const { userId } = event',
        error: true,
        hint: 'Destructure mismatch: expects userId',
      },
      { id: 'b3', code: 'await userRepo.find(user_id)', error: false },
    ],
  },
  {
    id: 'db',
    title: 'Database / Event Payload',
    file: 'schemas/EventSchema.js',
    lines: [
      {
        id: 'c1',
        before: 'EventSchema { user_id: String }',
        after: 'EventSchema { userId: String }',
        error: true,
        hint: 'Schema field out of sync',
      },
      { id: 'c2', code: 'INSERT users SET id=?', error: false },
      { id: 'c3', code: 'queue.emit("auth.ok", { user_id })', error: false },
    ],
  },
];

const VIEW_MODES = ['z', 'y', 'x'];
const MODE_LABELS = { z: 'Z Depth', y: 'Y Stack', x: 'X Flow' };

const getApiUrl = (endpoint) => {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  if (!baseUrl) return endpoint;
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

/* ─────────────────────────────────────────
   CrossSectionNode — main component
   ───────────────────────────────────────── */
export default function CrossSectionNode({ data, id }) {
  const initialLayers = useMemo(
    () =>
      (data?.layers?.length ? data.layers : DEFAULT_LAYERS).map((layer) => ({
        ...layer,
        lines: (layer.lines ?? []).map((l) => ({ ...l, status: l.error ? 'error' : 'ok' })),
      })),
    [data]
  );

  const [mode, setMode] = useState(data?.axisMode || 'collapsed');

  React.useEffect(() => {
    if (data?.axisMode !== undefined) setMode(data.axisMode);
  }, [data?.axisMode]);

  const [layers, setLayers] = useState(initialLayers);
  const [repairingLine, setRepairingLine] = useState(null);
  const [tilt, setTilt] = useState({ x: 18, y: -25 });
  const cubeRef = useRef(null);

  const hasImpacted = layers.some((l) => (l.lines ?? []).some((ln) => ln.status === 'error'));
  const allResolved = layers.every((l) => (l.lines ?? []).every((ln) => ln.status !== 'error'));
  const nodeStatus = data?.status ?? (!hasImpacted ? 'healthy' : allResolved ? 'resolved' : 'impacted');

  const layerHasError = useCallback((li) => {
    if (!layers[li]) return false;
    return (layers[li].lines ?? []).some((ln) => ln.status === 'error');
  }, [layers]);

  const handleRepairLine = useCallback(
    async (layerIdx, lineIdx) => {
      const key = `${layerIdx}-${lineIdx}`;
      if (repairingLine === key) return;
      setRepairingLine(key);

      try {
        await fetch(getApiUrl('/api/repair'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: data?.id || id,
            change: layers[layerIdx].lines[lineIdx].hint || 'schema mismatch',
            nodeId: id,
            layerIdx,
            lineIdx,
          }),
        });
      } catch (_) {
        // Optimistically resolve in the UI even if the network call fails;
        // swap this for an error toast if you want the repair to be blocking.
      }

      setTimeout(() => {
        setLayers((prev) =>
          prev.map((layer, li) => {
            if (li !== layerIdx) return layer;
            const newLines = layer.lines.map((line, lni) =>
              lni === lineIdx ? { ...line, status: 'resolved', error: false } : line
            );
            return { ...layer, lines: newLines };
          })
        );
        setRepairingLine(null);
      }, 850);
    },
    [repairingLine, layers, id, data]
  );

  const handleModeToggle = useCallback((m) => {
    setMode((prev) => (prev === m ? 'collapsed' : m));
  }, []);

  const handleMouseMove = (e) => {
    if (mode !== 'z' || !cubeRef.current) return;
    const rect = cubeRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: 18 - py * 30, y: -25 + px * 40 });
  };
  const handleMouseLeave = () => {
    if (mode !== 'z') return;
    setTilt({ x: 18, y: -25 });
  };

  const isExpanded = mode !== 'collapsed';
  const searchTerm = data?.searchTerm;

  return (
    <div className="csn-scene">
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ opacity: 0, width: 8, height: 8, background: '#64748b', border: 'none' }}
      />

      <div className="csn-shell">
        <div
          className="csn-header"
          onClick={() => setMode((m) => (m === 'collapsed' ? 'z' : 'collapsed'))}
          title="Click to expand / collapse"
        >
          <div className="csn-header-left">
            <span className={`csn-status-dot ${nodeStatus}`} />
            <span className="csn-label">
              <HighlightText text={data?.label || 'Service Node'} search={searchTerm} />
            </span>
          </div>
          <span className={`csn-impact-badge ${nodeStatus}`}>
            {nodeStatus === 'impacted' 
              ? '⚠ Root Cause' 
              : nodeStatus === 'affected-downstream'
              ? '⚡ Downstream'
              : nodeStatus === 'context'
              ? 'ℹ Context'
              : nodeStatus === 'resolved' 
              ? '✓ Resolved' 
              : '● Healthy'}
          </span>
        </div>

        <div className="csn-axis-bar">
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              className={`csn-axis-btn${mode === m ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleModeToggle(m);
              }}
              title={`View: ${MODE_LABELS[m]}`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <div className={`csn-cube-wrapper ${isExpanded ? 'expanded-wrapper' : 'collapsed-wrapper'}`}>
          <div
            className="csn-cube"
            ref={cubeRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={mode === 'z' ? { transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` } : undefined}
          >
            <div className={`csn-layers-container mode-${mode}`}>
              {isExpanded && layers.length > 1 && mode !== 'x' && (
                <div className="csn-spine-wrap">
                  {Array.from({ length: layers.length - 1 }, (_, i) => (
                    <div
                      key={i}
                      className={`csn-connector conn-${mode} conn-${i} ${
                        layerHasError(i) || layerHasError(i + 1) ? 'conn-error' : 'conn-ok'
                      }`}
                    >
                      <span className="csn-connector-arrow">⌄</span>
                    </div>
                  ))}
                </div>
              )}

              {layers.map((layer, li) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  layerIdx={li}
                  repairingLine={repairingLine}
                  onRepairLine={handleRepairLine}
                  searchTerm={searchTerm}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ opacity: 0, width: 8, height: 8, background: '#64748b', border: 'none' }}
      />
    </div>
  );
}

function LayerCard({ layer, layerIdx, repairingLine, onRepairLine, searchTerm }) {
  const safeLines = layer.lines ?? [];
  const broken = safeLines.some((l) => l.status === 'error');
  const resolvedRecently = safeLines.some((l) => l.status === 'resolved') && !broken;

  return (
    <div
      className={`csn-layer ${broken ? 'layer-broken' : resolvedRecently ? 'layer-resolved' : 'layer-healthy'}`}
      style={{ animationDelay: `${layerIdx * 70}ms` }}
    >
      <div className="csn-layer-header">
        <div className="csn-layer-title-wrap">
          <span className="csn-layer-title">
            <HighlightText text={layer.title} search={searchTerm} />
          </span>
          <span className={`csn-layer-file ${broken ? 'file-broken' : ''}`}>
            {broken && <span className="csn-file-warn">⚠</span>}
            <HighlightText text={layer.file} search={searchTerm} />
          </span>
        </div>
        <span className={`csn-layer-status-tag ${broken ? 'error' : resolvedRecently ? 'resolved' : 'ok'}`}>
          {broken ? 'broken' : resolvedRecently ? 'fixed' : 'ok'}
        </span>
      </div>

      <div className="csn-line-list">
        {safeLines.map((line, lni) => {
          const key = `${layerIdx}-${lni}`;
          const isRepairing = repairingLine === key;

          if (line.status === 'error') {
            return (
              <div key={line.id} className={`csn-line-item error ${isRepairing ? 'repairing' : ''}`}>
                <div className="csn-diff-row before">
                  <span className="csn-line-gutter">{lni + 1}</span>
                  <span className="csn-line-code strike">
                    <HighlightText text={line.before || line.code} search={searchTerm} />
                  </span>
                </div>
                <div className="csn-diff-row after">
                  <span className="csn-line-gutter">↳</span>
                  <span className="csn-line-code proposed">
                    <HighlightText text={line.after || line.code} search={searchTerm} />
                  </span>
                  {!isRepairing ? (
                    <button
                      className="csn-fix-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRepairLine(layerIdx, lni);
                      }}
                      title={line.hint}
                    >
                      🔧 Fix
                    </button>
                  ) : (
                    <span className="csn-fix-spinner">⟳ applying…</span>
                  )}
                </div>
                <div className="csn-hint">
                  <HighlightText text={line.hint} search={searchTerm} />
                </div>
              </div>
            );
          }

          return (
            <div key={line.id} className={`csn-line-item ${line.status === 'resolved' ? 'resolved-line' : ''}`}>
              <span className="csn-line-gutter">{lni + 1}</span>
              <span className="csn-line-code">
                <HighlightText text={line.code} search={searchTerm} />
              </span>
              {line.status === 'resolved' && <span className="csn-repair-icon">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
