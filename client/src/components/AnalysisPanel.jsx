/**
 * AnalysisPanel Component
 * Handles repository URL input and analysis triggering
 */

import React, { useEffect, useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { AlertCircle, Loader } from 'lucide-react';
import { startFullScan, subscribeToAnalysis } from '../lib/analysisClient.js';

export const AnalysisPanel = () => {
  const { analysis, startAnalysis, setAnalysis, finishAnalysis, failAnalysis } = useAppContext();
  const [repoUrl, setRepoUrl] = useState('');
  const [bugInput, setBugInput] = useState({ type: 'fullScan', content: '' });
  const [localError, setLocalError] = useState('');
  const inputRef = useRef(null);
  const subscriptionRef = useRef(null);

  useEffect(() => () => subscriptionRef.current?.(), []);

  const handleAnalyze = async () => {
    setLocalError('');

    // Validate input
    if (!repoUrl.trim()) {
      setLocalError('Please enter a repository URL');
      inputRef.current?.focus();
      return;
    }

    try {
      const url = new URL(repoUrl);
      if (!url.hostname.includes('github.com')) {
        setLocalError('Only GitHub repositories are supported');
        return;
      }
    } catch {
      setLocalError('Invalid URL format');
      return;
    }

    // Start analysis
    startAnalysis(repoUrl);

    try {
      const jobId = await startFullScan(repoUrl);
      subscriptionRef.current?.();
      subscriptionRef.current = subscribeToAnalysis(jobId, {
        onStage: ({ stage, pct }) => setAnalysis({ analyzeStage: stage || '', analyzePct: pct || 0 }),
        onDone: (result) => finishAnalysis(result),
        onError: (error) => failAnalysis(error.message),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setLocalError(message);
      failAnalysis(message);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-lg p-6 mb-6">
      <h2 className="text-2xl font-bold text-white mb-4">Analyze Repository</h2>

      <div className="space-y-4">
        {/* Repo URL Input */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Repository URL
          </label>
          <input
            ref={inputRef}
            type="text"
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              setLocalError('');
            }}
            disabled={analysis.analyzing}
            className="w-full px-4 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Bug Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">
            Analysis Type
          </label>
          <select
            value={bugInput.type}
            onChange={(e) =>
              setBugInput({
                ...bugInput,
                type: e.target.value,
              })
            }
            disabled={analysis.analyzing}
            className="w-full px-4 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            <option value="fullScan">Full Repository Scan</option>
            <option value="stackTrace">Stack Trace</option>
            <option value="description">Description</option>
            <option value="testFailure">Test Failure</option>
          </select>
        </div>

        {/* Content Input (for non-fullScan) */}
        {bugInput.type !== 'fullScan' && (
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {bugInput.type === 'stackTrace'
                ? 'Stack Trace'
                : bugInput.type === 'testFailure'
                  ? 'Test Failure Output'
                  : 'Bug Description'}
            </label>
            <textarea
              value={bugInput.content}
              onChange={(e) =>
                setBugInput({
                  ...bugInput,
                  content: e.target.value,
                })
              }
              disabled={analysis.analyzing}
              className="w-full px-4 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 h-32"
              placeholder={`Enter ${bugInput.type === 'stackTrace' ? 'stack trace' : bugInput.type === 'testFailure' ? 'test failure output' : 'bug description'}`}
            />
          </div>
        )}

        {/* Error Display */}
        {(localError || analysis.error) && (
          <div className="bg-red-900/30 border border-red-600 rounded p-3 flex gap-2">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-red-200 text-sm">{localError || analysis.error}</p>
          </div>
        )}

        {/* Progress Display */}
        {analysis.analyzing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">{analysis.analyzeStage}</span>
              <span className="text-gray-400">{analysis.analyzePct}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${analysis.analyzePct}%` }}
              />
            </div>
          </div>
        )}

        {/* Analyze Button */}
        <button
          onClick={handleAnalyze}
          disabled={analysis.analyzing || !repoUrl.trim()}
          className="w-full py-2 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {analysis.analyzing ? (
            <>
              <Loader size={16} className="animate-spin" />
              Analyzing...
            </>
          ) : (
            'Analyze Repository'
          )}
        </button>
      </div>

      {/* Backend Status */}
      <div className={`mt-4 text-sm ${analysis.backendStatus === 'ok' ? 'text-green-400' : analysis.backendStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
        Backend: {analysis.backendStatus === 'ok' ? '✓ Connected' : analysis.backendStatus === 'error' ? '✗ Disconnected' : '⟳ Connecting...'}
      </div>
    </div>
  );
};

export default AnalysisPanel;
