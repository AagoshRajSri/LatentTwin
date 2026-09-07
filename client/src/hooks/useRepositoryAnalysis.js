import { useCallback, useEffect, useRef } from 'react';
import { getAnalysisApiUrl, getAnalysisResult, startFullScan } from '../lib/analysisClient.js';

export function useRepositoryAnalysis({ repoUrl, onStage, onResult, onError, onStart, onComplete }) {
  const cancelRef = useRef(null);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const analyze = useCallback(async () => {
    cancel();
    onStart?.();
    try {
      const jobId = await startFullScan(repoUrl);
      const source = new EventSource(getAnalysisApiUrl(`/analyze/${jobId}/events`));
      let settled = false;
      let reconnecting = false;
      let reconnectTimer;

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(reconnectTimer);
        source.close();
        cancelRef.current = null;
        callback?.();
        onComplete?.();
      };

      const recoverResult = async () => {
        if (settled || reconnecting) return;
        reconnecting = true;
        onStage?.({ stage: 'Reconnecting to analysis...', pct: 90 });
        for (let attempt = 0; attempt < 6 && !settled; attempt += 1) {
          try {
            const result = await getAnalysisResult(jobId);
            if (result) {
              finish(() => onResult?.(result));
              return;
            }
          } catch (error) {
            if (attempt === 5) finish(() => onError?.(error));
          }
          await new Promise((resolve) => { reconnectTimer = setTimeout(resolve, 1500); });
        }
        if (!settled) finish(() => onError?.(new Error('Analysis result was not ready')));
      };

      source.addEventListener('stage', (event) => {
        try { onStage?.(JSON.parse(event.data)); }
        catch { finish(() => onError?.(new Error('Malformed analysis progress event'))); }
      });
      source.addEventListener('done', recoverResult);
      source.addEventListener('error', (event) => {
        let message = 'Analysis service reported an error';
        try { message = JSON.parse(event.data).message || message; } catch { /* connection error */ }
        finish(() => onError?.(new Error(message)));
      });
      source.onerror = recoverResult;
      cancelRef.current = () => finish();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Could not start analysis'));
      onComplete?.();
    }
  }, [cancel, onComplete, onError, onResult, onStage, onStart, repoUrl]);

  useEffect(() => cancel, [cancel]);
  return { analyze, cancel };
}
