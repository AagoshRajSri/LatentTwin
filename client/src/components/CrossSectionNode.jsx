import React, { useState, useCallback, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import './CrossSectionNode.css';

/* ─────────────────────────────────────────
   Static layer definitions.
   Each layer represents an architectural tier.
   Lines marked error:true are highlight-able.
   ───────────────────────────────────────── */
const DEFAULT_LAYERS = [
  {
    id: 'api',
    title: 'API Entry / Routes',
    lines: [
      { id: 'a1', code: 'POST /auth/login', error: false },
      { id: 'a2', code: 'req.body.user_id  ← userId', error: true, hint: 'Field rename: user_id → userId' },
      { id: 'a3', code: 'validateSchema(payload)', error: false },
    ],
  },
  {
    id: 'logic',
    title: 'Business Logic / Controller',
    lines: [
      { id: 'b1', code: 'AuthController.handle()', error: false },
      { id: 'b2', code: 'const { user_id } = event', error: true, hint: 'Destructure mismatch: expects userId' },
      { id: 'b3', code: 'await userRepo.find(user_id)', error: false },
    ],
  },
  {
    id: 'db',
    title: 'Database / Event Payload',
    lines: [
      { id: 'c1', code: 'EventSchema { user_id: String }', error: true, hint: 'Schema field out of sync' },
      { id: 'c2', code: 'INSERT users SET id=?', error: false },
      { id: 'c3', code: 'queue.emit("auth.ok", { user_id })', error: false },
    ],
  },
];

const VIEW_MODES = ['collapsed', 'z', 'y', 'x'];
const MODE_LABELS = { collapsed: '⊟ Close', z: 'Z Depth', y: 'Y Stack', x: 'X Flow' };

/* ─────────────────────────────────────────
   getApiUrl — mirrors the helper in App.jsx
   ───────────────────────────────────────── */
const getApiUrl = (endpoint) => {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  if (!baseUrl) return endpoint;
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${cleanBase}/${cleanEndpoint}`;
};

/* ─────────────────────────────────────────
   CrossSectionNode — main component
   ───────────────────────────────────────── */
export default function CrossSectionNode({ data, id }) {
  /* Merge data-provided layers with default template */
  const initialLayers = (data?.layers || DEFAULT_LAYERS).map((layer) => ({
    ...layer,
    status: data?.status === 'impacted' ? 'impacted' : 'healthy',
    lines: layer.lines.map((l) => ({ ...l, status: l.error ? 'error' : 'ok' })),
  }));

  const [mode, setMode] = useState(data?.axisMode || 'collapsed');

  /* Sync when parent pushes a new axisMode via data prop */
  React.useEffect(() => {
    if (data?.axisMode !== undefined) {
      setMode(data.axisMode);
    }
  }, [data?.axisMode]);
  const [layers, setLayers] = useState(initialLayers);
  const [repairingLine, setRepairingLine] = useState(null); // `${layerIdx}-${lineIdx}`
  const cubeRef = useRef(null);

  /* ── Compute overall node status from layers ── */
  const hasImpacted = layers.some((l) => l.status === 'impacted' || l.lines.some((ln) => ln.status === 'error'));
  const allResolved = layers.every((l) => l.status !== 'impacted' && l.lines.every((ln) => ln.status !== 'error'));
  const nodeStatus = !hasImpacted ? 'healthy' : allResolved ? 'resolved' : 'impacted';

  /* ── Repair handler ── */
  const handleRepairLine = useCallback(
    async (layerIdx, lineIdx) => {
      const key = `${layerIdx}-${lineIdx}`;
      if (repairingLine === key) return;

      setRepairingLine(key);

      try {
        /* Fire repair API — mirrors existing /api/repair contract */
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
        /* Non-fatal — visual repair still proceeds */
      }

      /* Optimistic UI: mark line resolved after brief delay */
      setTimeout(() => {
        setLayers((prev) => {
          const next = prev.map((layer, li) => {
            if (li !== layerIdx) return layer;
            const newLines = layer.lines.map((line, lni) => {
              if (lni !== lineIdx) return line;
              return { ...line, status: 'resolved', error: false };
            });
            const stillImpacted = newLines.some((ln) => ln.status === 'error');
            return { ...layer, lines: newLines, status: stillImpacted ? 'impacted' : 'resolved' };
          });

          /* Cascade: after a further 300ms pulse neighbouring layers visually */
          setTimeout(() => {
            if (cubeRef.current) {
              cubeRef.current
                .querySelectorAll('.csn-layer')
                .forEach((el, i) => {
                  if (i !== layerIdx) {
                    el.classList.add('cascade-resolved');
                    setTimeout(() => el.classList.remove('cascade-resolved'), 900);
                  }
                });
            }
          }, 300);

          return next;
        });
        setRepairingLine(null);
      }, 900);
    },
    [repairingLine, layers, id, data]
  );

  /* ── Toggle axis mode ── */
  const handleModeToggle = useCallback((m) => {
    setMode((prev) => (prev === m && m !== 'collapsed' ? 'collapsed' : m));
  }, []);

  const isExpanded = mode !== 'collapsed';

  return (
    <>
      {/* ReactFlow connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ opacity: 0, width: 8, height: 8, background: '#64748b', border: 'none' }}
      />

      <div className="csn-scene">
        <div className="csn-shell">
          {/* ── Header ── */}
          <div
            className="csn-header"
            onClick={() => setMode((m) => (m === 'collapsed' ? 'z' : 'collapsed'))}
            title="Click to expand / collapse"
          >
            <div className="csn-header-left">
              <span className={`csn-status-dot ${nodeStatus}`} />
              <span className="csn-label">{data?.label || 'Service Node'}</span>
            </div>
            <span className={`csn-impact-badge ${nodeStatus}`}>
              {nodeStatus === 'impacted' ? '⚠ Impacted' : nodeStatus === 'resolved' ? '✓ Resolved' : '● Healthy'}
            </span>
          </div>

          {/* ── Axis toggle bar ── */}
          <div className="csn-axis-bar">
            {VIEW_MODES.filter((m) => m !== 'collapsed').map((m) => (
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

          {/* ── 3D Cube wrapper ── */}
          <div className={`csn-cube-wrapper ${isExpanded ? 'expanded-wrapper' : 'collapsed-wrapper'}`}>
            <div className="csn-cube" ref={cubeRef}>
              <div className={`csn-layers-container mode-${mode}`}>
                {layers.map((layer, li) => (
                  <LayerCard
                    key={layer.id}
                    layer={layer}
                    layerIdx={li}
                    repairingLine={repairingLine}
                    onRepairLine={handleRepairLine}
                  />
                ))}
              </div>
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
    </>
  );
}

/* ─────────────────────────────────────────
   LayerCard sub-component
   ───────────────────────────────────────── */
function LayerCard({ layer, layerIdx, repairingLine, onRepairLine }) {
  return (
    <div className={`csn-layer layer-status-${layer.status}`}>
      <div className="csn-layer-header">
        <span className="csn-layer-title">{layer.title}</span>
        <span className={`csn-layer-status-tag ${layer.status}`}>
          {layer.status}
        </span>
      </div>
      <div className="csn-line-list">
        {layer.lines.map((line, lni) => {
          const key = `${layerIdx}-${lni}`;
          const isRepairing = repairingLine === key;
          const lineClass = isRepairing
            ? 'repairing'
            : line.status === 'resolved'
            ? 'resolved-line'
            : line.status === 'error'
            ? 'error'
            : '';

          return (
            <div
              key={line.id}
              className={`csn-line-item ${lineClass}`}
              title={line.status === 'error' ? `⚠ ${line.hint} — Click to repair` : line.code}
              onClick={line.status === 'error' && !isRepairing ? () => onRepairLine(layerIdx, lni) : undefined}
            >
              <span className="csn-line-gutter">{lni + 1}</span>
              <span className="csn-line-code">{line.code}</span>
              {line.status === 'error' && !isRepairing && (
                <span className="csn-repair-icon" title="Click to auto-repair">🔧</span>
              )}
              {isRepairing && (
                <span className="csn-repair-icon">⟳</span>
              )}
              {line.status === 'resolved' && (
                <span className="csn-repair-icon" title="Resolved">✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
