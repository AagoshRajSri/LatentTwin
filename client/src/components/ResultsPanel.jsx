/**
 * ResultsPanel Component
 * Displays analysis results and handles repair triggering
 */

import React, { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { exportJSON, exportMarkdown } from '../lib/exportReport';
import RepairFlow from './RepairFlow.jsx';

export const ResultsPanel = () => {
  const { analysis } = useAppContext();
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown'>('json');

  if (!analysis.graphData) {
    return null;
  }

  const bugCount = analysis.graphData.nodes?.filter(
    (n) => n.status === 'impacted'
  ).length || 0;

  const affectedCount = analysis.graphData.nodes?.filter(
    (n) => n.status === 'affected-downstream'
  ).length || 0;

  const handleExport = () => {
    if (exportFormat === 'json') {
      exportJSON(analysis.graphData, `analysis-${Date.now()}.json`);
    } else {
      exportMarkdown(analysis.graphData, `analysis-${Date.now()}.md`);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg p-6 mb-6">
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-xl font-bold text-white">Analysis Results</h3>
        <div className="flex gap-2">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="px-3 py-1 bg-slate-700 text-white rounded text-sm border border-slate-600 focus:border-blue-500 focus:outline-none"
          >
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
          </select>
          <button
            onClick={handleExport}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm flex items-center gap-1 transition-colors"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-900/20 to-red-900/10 rounded-lg p-4 border border-red-700/20">
          <div className="text-sm text-red-300 mb-1">Bugs Found</div>
          <div className="text-2xl font-bold text-red-400">{bugCount}</div>
        </div>

        <div className="bg-gradient-to-br from-amber-900/20 to-amber-900/10 rounded-lg p-4 border border-amber-700/20">
          <div className="text-sm text-amber-300 mb-1">Affected Files</div>
          <div className="text-2xl font-bold text-amber-400">{affectedCount}</div>
        </div>
      </div>

      {/* Node Details */}
      {bugCount > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            Impacted Files
          </h4>

          {analysis.graphData.nodes
            ?.filter((n) => n.status === 'impacted')
            .map((node) => (
              <div
                key={node.id}
                className="bg-slate-700 rounded p-3 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div className="font-mono text-sm text-blue-300">
                    {node.file}
                  </div>
                  <span className="px-2 py-1 bg-red-900/30 text-red-300 text-xs rounded border border-red-700/20">
                    {node.status}
                  </span>
                </div>

                {node.label && (
                  <div className="text-xs text-gray-400">{node.label}</div>
                )}

                {node.lines?.length > 0 && (
                  <div className="bg-slate-600 rounded p-2 space-y-1">
                    {node.lines.slice(0, 2).map((line, idx) => (
                      <div key={idx} className="text-xs font-mono text-red-300">
                        {line.before || line.code}
                      </div>
                    ))}
                    {node.lines.length > 2 && (
                      <div className="text-xs text-gray-400 italic">
                        +{node.lines.length - 2} more line{node.lines.length - 2 !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {bugCount === 0 && (
        <div className="text-center py-8">
          <div className="text-green-400 text-4xl mb-2">✓</div>
          <p className="text-green-300 font-medium">Repository is healthy!</p>
          <p className="text-gray-400 text-sm mt-1">No critical bugs detected.</p>
        </div>
      )}

      {bugCount > 0 && <div className="mt-6"><RepairFlow target={analysis.graphData.nodes.find((node) => node.status === 'impacted')?.file || 'auth-service'} /></div>}
    </div>
  );
};

export default ResultsPanel;
