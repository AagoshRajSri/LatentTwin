/**
 * SearchPanel Component
 * Provides graph search and filtering functionality
 */

import React, { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export const SearchPanel = () => {
  const { analysis, ui, setUI, setAnalysis } = useAppContext();

  // Filter nodes based on search
  const searchResults = useMemo(() => {
    if (!ui.graphSearch.trim() || !analysis.graphData?.nodes) {
      return [];
    }

    const query = ui.graphSearch.toLowerCase();
    return analysis.graphData.nodes.filter((node) => {
      const matchFile = node.file?.toLowerCase().includes(query);
      const matchLabel = node.label?.toLowerCase().includes(query);
      const matchCode = node.lines?.some((line) =>
        line.code?.toLowerCase().includes(query)
      );
      return matchFile || matchLabel || matchCode;
    });
  }, [ui.graphSearch, analysis.graphData]);

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg p-4 mb-4">
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-3 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search files, functions, or errors..."
            value={ui.graphSearch}
            onChange={(e) => setUI({ graphSearch: e.target.value })}
            className="w-full pl-9 pr-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
          />
          {ui.graphSearch && (
            <button
              onClick={() => setUI({ graphSearch: '' })}
              className="absolute right-2 top-2 text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {ui.graphSearch && searchResults.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <p className="text-xs text-gray-400">
            Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </p>
          {searchResults.map((node) => (
            <div
              key={node.id}
              className="bg-slate-700 p-2 rounded text-sm cursor-pointer hover:bg-slate-600 transition-colors"
              onClick={() => setAnalysis({ selectedNode: node })}
              title={`Select ${node.file}`}
            >
              <div className="font-mono text-blue-300">{node.file}</div>
              {node.label && (
                <div className="text-xs text-gray-400 mt-1">{node.label}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {ui.graphSearch && searchResults.length === 0 && (
        <p className="text-sm text-gray-400 italic">No matching files or functions found</p>
      )}
    </div>
  );
};

export default SearchPanel;
