/**
 * diffUtils.js
 * Client-side utilities for computing and rendering line-by-line diffs.
 * Implements LCS/Myers-based diffing, hunk extraction, unified diff format
 * generation, and .patch file downloading.
 */

// ─────────────────────────────────────────────────────────────
// Myers Diff Algorithm
// ─────────────────────────────────────────────────────────────

/**
 * Myers diff — returns minimal edit sequence between two arrays of strings.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{type: 'context'|'removed'|'added', content: string}>}
 */
function myersDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  const v = new Array(2 * max + 1).fill(0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const ki = k + max;
      let x;
      if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
        x = v[ki + 1];
      } else {
        x = v[ki - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[ki] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, max);
    }
  }
  return backtrack(trace, a, b, max);
}

function backtrack(trace, a, b, max) {
  const edits = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const ki = k + max;
    let prevK;
    if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[prevK + max];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--; y--;
      edits.unshift({ type: 'context', content: a[x] });
    }
    if (d > 0) {
      if (x === prevX) {
        edits.unshift({ type: 'added', content: b[prevY] });
      } else {
        edits.unshift({ type: 'removed', content: a[prevX] });
      }
    }
    x = prevX;
    y = prevY;
  }
  return edits;
}

// ─────────────────────────────────────────────────────────────
// Core Diff Computation
// ─────────────────────────────────────────────────────────────

/**
 * Compute a line-by-line diff between two strings.
 * @param {string} originalText
 * @param {string} fixedText
 * @param {number} [contextLines=3]
 * @returns {{ hunks: Hunk[], allLines: DiffLine[] }}
 */
export function computeDiff(originalText, fixedText, contextLines = 3) {
  const origLines = (originalText || '').split('\n');
  const newLines = (fixedText || '').split('\n');
  const edits = myersDiff(origLines, newLines);

  let lineOrig = 1;
  let lineNew = 1;

  const allLines = edits.map((edit) => {
    if (edit.type === 'context') {
      return { type: 'context', content: edit.content, lineOrig: lineOrig++, lineNew: lineNew++ };
    }
    if (edit.type === 'removed') {
      return { type: 'removed', content: edit.content, lineOrig: lineOrig++, lineNew: null };
    }
    return { type: 'added', content: edit.content, lineOrig: null, lineNew: lineNew++ };
  });

  const hunks = extractHunks(allLines, contextLines);
  return { hunks, allLines };
}

// ─────────────────────────────────────────────────────────────
// Hunk Extraction
// ─────────────────────────────────────────────────────────────

function extractHunks(allLines, contextLines) {
  const changedIdxs = allLines
    .map((l, i) => (l.type !== 'context' ? i : -1))
    .filter((i) => i !== -1);

  if (changedIdxs.length === 0) return [];

  const hunks = [];
  let start = Math.max(0, changedIdxs[0] - contextLines);
  let end = Math.min(allLines.length - 1, changedIdxs[0] + contextLines);

  for (let i = 1; i < changedIdxs.length; i++) {
    const next = changedIdxs[i];
    if (next - contextLines <= end + contextLines) {
      end = Math.min(allLines.length - 1, next + contextLines);
    } else {
      hunks.push(buildHunk(allLines, start, end));
      start = Math.max(0, next - contextLines);
      end = Math.min(allLines.length - 1, next + contextLines);
    }
  }
  hunks.push(buildHunk(allLines, start, end));
  return hunks;
}

function buildHunk(allLines, start, end) {
  const lines = allLines.slice(start, end + 1);
  const firstOrig = lines.find((l) => l.lineOrig !== null)?.lineOrig ?? 1;
  const firstNew = lines.find((l) => l.lineNew !== null)?.lineNew ?? 1;
  return { startOrig: firstOrig, startNew: firstNew, lines };
}

// ─────────────────────────────────────────────────────────────
// Unified Diff String Generator
// ─────────────────────────────────────────────────────────────

/**
 * Generates a standard unified diff string (git apply / .patch compatible).
 * @param {string} filePath
 * @param {import('./diffUtils').Hunk[]} hunks
 * @returns {string}
 */
export function toUnifiedDiff(filePath, hunks) {
  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  const hunkStrings = hunks.map((hunk) => {
    const removedCount = hunk.lines.filter((l) => l.type === 'removed').length;
    const addedCount = hunk.lines.filter((l) => l.type === 'added').length;
    const contextCount = hunk.lines.filter((l) => l.type === 'context').length;
    const origSpan = removedCount + contextCount;
    const newSpan = addedCount + contextCount;
    const hdr = `@@ -${hunk.startOrig},${origSpan} +${hunk.startNew},${newSpan} @@`;
    const body = hunk.lines
      .map((l) => (l.type === 'removed' ? `-${l.content}` : l.type === 'added' ? `+${l.content}` : ` ${l.content}`))
      .join('\n');
    return `${hdr}\n${body}`;
  });
  return `${header}\n${hunkStrings.join('\n')}`;
}

// ─────────────────────────────────────────────────────────────
// .patch File Download
// ─────────────────────────────────────────────────────────────

/**
 * Triggers a browser download of a .patch file for git apply.
 * @param {string} filePath
 * @param {import('./diffUtils').Hunk[]} hunks
 */
export function downloadPatch(filePath, hunks) {
  const patchContent = toUnifiedDiff(filePath, hunks);
  const blob = new Blob([patchContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filePath.replace(/[/\\]/g, '_')}.patch`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// Token-level Inline Diff (for same-line change highlighting)
// ─────────────────────────────────────────────────────────────

/**
 * Returns word-level diff spans for highlighting changes within a single line.
 * @param {string} orig
 * @param {string} fixed
 * @returns {Array<{type: 'same'|'added'|'removed', text: string}>}
 */
export function inlineCharDiff(orig, fixed) {
  if (orig === fixed) return [{ type: 'same', text: orig }];
  const origTokens = tokenize(orig);
  const fixedTokens = tokenize(fixed);
  const edits = myersDiff(origTokens, fixedTokens);
  return edits.map((e) => ({
    type: e.type === 'context' ? 'same' : e.type,
    text: e.content,
  }));
}

function tokenize(str) {
  return str.split(/(\s+|[{}()[\],;:.<>!=&|+\-*/^%~`"'\\])/);
}

// ─────────────────────────────────────────────────────────────
// Summary Stats
// ─────────────────────────────────────────────────────────────

/**
 * Returns quick stats for the diff summary bar.
 * @param {Array<{type: string}>} allLines
 * @returns {{ additions: number, deletions: number }}
 */
export function diffStats(allLines) {
  const additions = allLines.filter((l) => l.type === 'added').length;
  const deletions = allLines.filter((l) => l.type === 'removed').length;
  return { additions, deletions };
}
