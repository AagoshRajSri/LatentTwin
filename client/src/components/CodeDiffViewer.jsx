import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  X, Copy, Download, Check, Loader, ShieldCheck, ShieldX,
  GitCompare, AlignLeft, ChevronDown, ChevronUp, AlertTriangle,
  Lightbulb, Zap, FileCode, ArrowRight,
} from 'lucide-react';
import { computeDiff, diffStats, inlineCharDiff, downloadPatch } from '../lib/diffUtils.js';

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

const getAnalysisApiUrl = (endpoint) => {
  const base =
    import.meta.env.VITE_ANALYSIS_API_URL ||
    (import.meta.env.PROD ? '' : 'http://localhost:3001');
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanEp = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${cleanBase}/${cleanEp}`;
};

// ─────────────────────────────────────────────────────────────
// Inline Diff Span (token-level highlights within a changed line)
// ─────────────────────────────────────────────────────────────

function InlineDiff({ orig, fixed, side }) {
  const tokens = useMemo(() => {
    try { return inlineCharDiff(orig || '', fixed || ''); }
    catch { return [{ type: 'same', text: side === 'left' ? orig : fixed }]; }
  }, [orig, fixed, side]);

  return (
    <span>
      {tokens.map((tok, i) => {
        if (tok.type === 'same') return <span key={i}>{tok.text}</span>;
        if (side === 'left' && tok.type === 'removed')
          return <mark key={i} style={{ background: 'rgba(239,68,68,0.35)', borderRadius: 2, padding: '0 1px' }}>{tok.text}</mark>;
        if (side === 'right' && tok.type === 'added')
          return <mark key={i} style={{ background: 'rgba(34,197,94,0.35)', borderRadius: 2, padding: '0 1px' }}>{tok.text}</mark>;
        return null;
      })}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Side-by-Side Split View
// ─────────────────────────────────────────────────────────────

function SplitView({ hunks, leftScroll, rightScroll, onScrollLeft, onScrollRight }) {
  if (!hunks || hunks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#6b7280', fontSize: 13 }}>
        <Check size={16} style={{ marginRight: 6, color: '#22c55e' }} />
        Files are identical — no changes detected.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* LEFT — Original */}
      <div
        ref={leftScroll}
        onScroll={onScrollLeft}
        style={{ overflow: 'auto', borderRight: '1px solid #1f2937', background: '#0d1117' }}
      >
        <div style={{ padding: '8px 0', minWidth: 'max-content' }}>
          <div style={{ padding: '4px 16px 8px', fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1f2937', marginBottom: 4 }}>
            Before (Original)
          </div>
          {hunks.map((hunk, hi) => (
            <HunkBlock key={hi} hunk={hunk} side="left" />
          ))}
        </div>
      </div>

      {/* RIGHT — Fixed */}
      <div
        ref={rightScroll}
        onScroll={onScrollRight}
        style={{ overflow: 'auto', background: '#0d1117' }}
      >
        <div style={{ padding: '8px 0', minWidth: 'max-content' }}>
          <div style={{ padding: '4px 16px 8px', fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1f2937', marginBottom: 4 }}>
            After (Fixed)
          </div>
          {hunks.map((hunk, hi) => (
            <HunkBlock key={hi} hunk={hunk} side="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Unified View
// ─────────────────────────────────────────────────────────────

function UnifiedView({ hunks }) {
  if (!hunks || hunks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#6b7280', fontSize: 13 }}>
        <Check size={16} style={{ marginRight: 6, color: '#22c55e' }} />
        No changes — file is clean.
      </div>
    );
  }
  return (
    <div style={{ overflow: 'auto', background: '#0d1117', height: '100%' }}>
      <div style={{ padding: '8px 0', minWidth: 'max-content' }}>
        {hunks.map((hunk, hi) => (
          <div key={hi} style={{ marginBottom: 8 }}>
            <div style={{ padding: '2px 16px', fontSize: 11, color: '#6b7280', background: '#111827', fontFamily: 'monospace', borderTop: hi > 0 ? '1px solid #1f2937' : 'none' }}>
              @@ -{hunk.startOrig} +{hunk.startNew} @@
            </div>
            {hunk.lines.map((line, li) => {
              const bg =
                line.type === 'removed' ? 'rgba(239,68,68,0.08)' :
                line.type === 'added' ? 'rgba(34,197,94,0.08)' : 'transparent';
              const color =
                line.type === 'removed' ? '#fca5a5' :
                line.type === 'added' ? '#86efac' : '#9ca3af';
              const prefix =
                line.type === 'removed' ? '-' :
                line.type === 'added' ? '+' : ' ';
              const lineNum = line.type === 'removed' ? line.lineOrig : line.lineNew;
              return (
                <div key={li} style={{ display: 'flex', alignItems: 'baseline', background: bg, padding: '0 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: '22px' }}>
                  <span style={{ color: '#374151', minWidth: 40, marginRight: 8, userSelect: 'none', textAlign: 'right', fontSize: 11 }}>{lineNum ?? ''}</span>
                  <span style={{ color: line.type === 'removed' ? '#ef4444' : line.type === 'added' ? '#22c55e' : '#374151', marginRight: 8, userSelect: 'none', fontWeight: 700 }}>{prefix}</span>
                  <span style={{ color, whiteSpace: 'pre' }}>{line.content}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hunk Block (shared by SplitView for one side)
// ─────────────────────────────────────────────────────────────

function HunkBlock({ hunk, side }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ padding: '1px 16px', fontSize: 11, color: '#374151', background: '#111827', fontFamily: 'monospace' }}>
        ···
      </div>
      {hunk.lines.map((line, li) => {
        const isRemoved = line.type === 'removed';
        const isAdded = line.type === 'added';
        const isContext = line.type === 'context';

        // On the left side, show removed + context. Skip added.
        // On the right side, show added + context. Skip removed.
        if (side === 'left' && isAdded) {
          // Show a blank placeholder row to keep sync
          return (
            <div key={li} style={{ display: 'flex', alignItems: 'baseline', background: 'rgba(34,197,94,0.04)', padding: '0 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: '22px', minHeight: 22 }}>
              <span style={{ minWidth: 40, marginRight: 8 }} />
              <span style={{ marginRight: 8, minWidth: 12 }} />
              <span style={{ whiteSpace: 'pre', color: 'transparent', userSelect: 'none' }}>{line.content || ' '}</span>
            </div>
          );
        }
        if (side === 'right' && isRemoved) {
          return (
            <div key={li} style={{ display: 'flex', alignItems: 'baseline', background: 'rgba(239,68,68,0.04)', padding: '0 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: '22px', minHeight: 22 }}>
              <span style={{ minWidth: 40, marginRight: 8 }} />
              <span style={{ marginRight: 8, minWidth: 12 }} />
              <span style={{ whiteSpace: 'pre', color: 'transparent', userSelect: 'none' }}>{line.content || ' '}</span>
            </div>
          );
        }

        const bg =
          side === 'left' && isRemoved ? 'rgba(239,68,68,0.12)' :
          side === 'right' && isAdded ? 'rgba(34,197,94,0.12)' : 'transparent';
        const color =
          side === 'left' && isRemoved ? '#fca5a5' :
          side === 'right' && isAdded ? '#86efac' : '#9ca3af';
        const lineNum = side === 'left' ? line.lineOrig : line.lineNew;

        return (
          <div key={li} style={{ display: 'flex', alignItems: 'baseline', background: bg, padding: '0 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: '22px' }}>
            <span style={{ color: '#374151', minWidth: 40, marginRight: 8, userSelect: 'none', textAlign: 'right', fontSize: 11 }}>{lineNum ?? ''}</span>
            <span style={{ color, whiteSpace: 'pre' }}>{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Root Cause Banner
// ─────────────────────────────────────────────────────────────

function RootCauseBanner({ bugs, rootCause, fixRationale, semgrepRules }) {
  const [expanded, setExpanded] = useState(true);

  const rules = semgrepRules?.length > 0 ? semgrepRules : null;

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(17,24,39,0.95) 0%, rgba(15,23,42,0.98) 100%)', borderBottom: '1px solid #1f2937' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', flexGrow: 1 }}>
          Root Cause Breakdown
        </span>
        {expanded ? <ChevronUp size={13} style={{ color: '#6b7280' }} /> : <ChevronDown size={13} style={{ color: '#6b7280' }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Semgrep Rules */}
          {rules && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {rules.map((rule, i) => (
                <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: 'monospace' }}>
                  {rule}
                </span>
              ))}
            </div>
          )}

          {/* Root Cause */}
          {rootCause && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={13} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Why It Breaks</p>
                <p style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>{rootCause}</p>
              </div>
            </div>
          )}

          {/* Fix Rationale */}
          {fixRationale && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Lightbulb size={13} style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Why The Fix Works</p>
                <p style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>{fixRationale}</p>
              </div>
            </div>
          )}

          {/* Bug lines summary */}
          {bugs && bugs.length > 0 && !rootCause && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bugs.map((bug, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(239,68,68,0.06)', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)' }}>
                  <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', minWidth: 24 }}>L{bug.lineNumber ?? '?'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <code style={{ fontSize: 11, color: '#fca5a5', background: 'rgba(239,68,68,0.12)', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{bug.before}</code>
                      <ArrowRight size={11} style={{ color: '#6b7280', flexShrink: 0 }} />
                      <code style={{ fontSize: 11, color: '#86efac', background: 'rgba(34,197,94,0.12)', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{bug.after}</code>
                    </div>
                    {bug.hint && <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>{bug.hint}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Verify Fix Status Badge
// ─────────────────────────────────────────────────────────────

function VerifyBadge({ status, issues }) {
  if (status === 'idle') return null;
  if (status === 'loading') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9ca3af' }}>
      <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…
    </span>
  );
  if (status === 'clean') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.12)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(34,197,94,0.25)' }}>
      <ShieldCheck size={12} /> Verified — 0 issues
    </span>
  );
  if (status === 'issues') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.25)' }}>
      <ShieldX size={12} /> {issues?.length ?? '?'} issue{issues?.length !== 1 ? 's' : ''} remaining
    </span>
  );
  if (status === 'error') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#ef4444' }}>
      <ShieldX size={12} /> Verification failed
    </span>
  );
  return null;
}

// ─────────────────────────────────────────────────────────────
// Main CodeDiffViewer
// ─────────────────────────────────────────────────────────────

/**
 * CodeDiffViewer
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - filePath: string — relative path of the file being fixed
 *  - originalContent: string | null — original file text
 *  - fixedContent: string | null — fixed file text (may be null if AI hasn't run yet)
 *  - bugs: Array<{ before, after, hint, lineNumber }> — detected bugs
 *  - rootCause: string | null — AI explanation of why the code broke
 *  - fixRationale: string | null — AI explanation of why the fix works
 *  - semgrepRules: string[] — rule IDs that fired
 *  - onApplyFix: () => void — callback when user applies fix to graph
 *  - isLoadingFix: boolean — true while AI is generating the fix
 */
export default function CodeDiffViewer({
  isOpen,
  onClose,
  filePath = 'unknown/file.js',
  originalContent = null,
  fixedContent = null,
  bugs = [],
  rootCause = null,
  fixRationale = null,
  semgrepRules = [],
  onApplyFix,
  isLoadingFix = false,
}) {
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'unified'
  const [showFullFile, setShowFullFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState('idle'); // idle | loading | clean | issues | error
  const [verifyIssues, setVerifyIssues] = useState(null);
  const [applied, setApplied] = useState(false);

  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const syncingRef = useRef(false);

  // Compute diff
  const { hunks, allLines } = useMemo(() => {
    if (!originalContent || !fixedContent) return { hunks: [], allLines: [] };
    return computeDiff(originalContent, fixedContent, showFullFile ? 999999 : 3);
  }, [originalContent, fixedContent, showFullFile]);

  const stats = useMemo(() => diffStats(allLines), [allLines]);

  // Synchronized scrolling between split panes
  const onScrollLeft = useCallback(() => {
    if (syncingRef.current || !rightScrollRef.current || !leftScrollRef.current) return;
    syncingRef.current = true;
    rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
    rightScrollRef.current.scrollLeft = leftScrollRef.current.scrollLeft;
    syncingRef.current = false;
  }, []);

  const onScrollRight = useCallback(() => {
    if (syncingRef.current || !leftScrollRef.current || !rightScrollRef.current) return;
    syncingRef.current = true;
    leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
    leftScrollRef.current.scrollLeft = rightScrollRef.current.scrollLeft;
    syncingRef.current = false;
  }, []);

  // Reset state when new file is opened
  useEffect(() => {
    if (isOpen) {
      setApplied(false);
      setVerifyStatus('idle');
      setVerifyIssues(null);
    }
  }, [isOpen, filePath]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleCopy = useCallback(async () => {
    if (!fixedContent) return;
    try {
      await navigator.clipboard.writeText(fixedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [fixedContent]);

  const handleDownloadPatch = useCallback(() => {
    if (hunks.length === 0) return;
    downloadPatch(filePath, hunks);
  }, [filePath, hunks]);

  const handleVerify = useCallback(async () => {
    if (!fixedContent) return;
    setVerifyStatus('loading');
    setVerifyIssues(null);
    try {
      const res = await fetch(getAnalysisApiUrl('/verify-fix'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filePath, content: fixedContent }),
      });
      if (!res.ok) { setVerifyStatus('error'); return; }
      const data = await res.json();
      setVerifyStatus(data.clean ? 'clean' : 'issues');
      setVerifyIssues(data.remainingIssues ?? []);
    } catch {
      setVerifyStatus('error');
    }
  }, [fixedContent, filePath]);

  const handleApply = useCallback(() => {
    setApplied(true);
    onApplyFix?.();
  }, [onApplyFix]);

  if (!isOpen) return null;

  const hasContent = originalContent && fixedContent;
  const filename = filePath.split('/').pop() || filePath;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 1200, height: '90vh',
          background: '#0d1117',
          border: '1px solid #1f2937',
          borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #1f2937', background: '#111827', flexShrink: 0 }}>
          <GitCompare size={16} style={{ color: '#6366f1' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f9fafb', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileCode size={13} style={{ color: '#9ca3af' }} />
              <span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{filename}</span>
              <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filePath}</span>
            </p>
          </div>

          {/* Stats */}
          {hasContent && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {stats.additions > 0 && (
                <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>+{stats.additions}</span>
              )}
              {stats.deletions > 0 && (
                <span style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>-{stats.deletions}</span>
              )}
            </div>
          )}

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: '#1f2937', borderRadius: 6, padding: 2, gap: 2 }}>
            <button
              onClick={() => setViewMode('split')}
              title="Split View"
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: viewMode === 'split' ? '#374151' : 'transparent',
                color: viewMode === 'split' ? '#f9fafb' : '#6b7280',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <GitCompare size={11} /> Split
            </button>
            <button
              onClick={() => setViewMode('unified')}
              title="Unified View"
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: viewMode === 'unified' ? '#374151' : 'transparent',
                color: viewMode === 'unified' ? '#f9fafb' : '#6b7280',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <AlignLeft size={11} /> Unified
            </button>
          </div>

          <button
            onClick={() => setShowFullFile(f => !f)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
          >
            {showFullFile ? 'Changed Only' : 'Full File'}
          </button>

          <button
            onClick={onClose}
            style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Root Cause Banner ── */}
        {(bugs.length > 0 || rootCause || fixRationale) && (
          <div style={{ flexShrink: 0 }}>
            <RootCauseBanner
              bugs={bugs}
              rootCause={rootCause}
              fixRationale={fixRationale}
              semgrepRules={semgrepRules}
            />
          </div>
        )}

        {/* ── Diff Area ── */}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {isLoadingFix ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <Loader size={24} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>Generating fix with AI…</p>
            </div>
          ) : !hasContent ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: 32 }}>
              <FileCode size={28} style={{ color: '#374151' }} />
              <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', margin: 0 }}>
                No fixed version available yet.<br />Click <strong style={{ color: '#a5b4fc' }}>"Generate Fix"</strong> to produce the corrected file.
              </p>
            </div>
          ) : viewMode === 'split' ? (
            <SplitView
              hunks={hunks}
              leftScroll={leftScrollRef}
              rightScroll={rightScrollRef}
              onScrollLeft={onScrollLeft}
              onScrollRight={onScrollRight}
            />
          ) : (
            <UnifiedView hunks={hunks} />
          )}
        </div>

        {/* ── Action Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderTop: '1px solid #1f2937', background: '#111827', flexShrink: 0, flexWrap: 'wrap',
        }}>
          {/* Apply Fix */}
          <button
            onClick={handleApply}
            disabled={applied || !hasContent}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, border: 'none', cursor: applied || !hasContent ? 'not-allowed' : 'pointer',
              background: applied ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: applied ? '#22c55e' : '#fff', fontSize: 12, fontWeight: 600,
              opacity: !hasContent ? 0.5 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {applied ? <><Check size={13} /> Applied</> : <><Zap size={13} /> Apply Fix</>}
          </button>

          {/* Verify Fix */}
          <button
            onClick={handleVerify}
            disabled={!hasContent || verifyStatus === 'loading'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, border: '1px solid #374151', cursor: !hasContent ? 'not-allowed' : 'pointer',
              background: 'transparent', color: '#9ca3af', fontSize: 12, fontWeight: 500,
              opacity: !hasContent ? 0.5 : 1,
            }}
          >
            <ShieldCheck size={13} /> Verify Fix
          </button>

          <VerifyBadge status={verifyStatus} issues={verifyIssues} />

          <div style={{ flex: 1 }} />

          {/* Copy Fixed File */}
          <button
            onClick={handleCopy}
            disabled={!fixedContent}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6, border: '1px solid #374151', cursor: !fixedContent ? 'not-allowed' : 'pointer',
              background: 'transparent', color: copied ? '#22c55e' : '#9ca3af', fontSize: 12, fontWeight: 500,
              opacity: !fixedContent ? 0.5 : 1, transition: 'color 0.15s',
            }}
          >
            {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Fixed</>}
          </button>

          {/* Download .patch */}
          <button
            onClick={handleDownloadPatch}
            disabled={hunks.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6, border: '1px solid #374151', cursor: hunks.length === 0 ? 'not-allowed' : 'pointer',
              background: 'transparent', color: '#9ca3af', fontSize: 12, fontWeight: 500,
              opacity: hunks.length === 0 ? 0.5 : 1,
            }}
          >
            <Download size={13} /> Download .patch
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
