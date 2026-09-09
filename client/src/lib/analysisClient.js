const getAnalysisApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
};

export async function startAnalysis(repoUrl, bugInput) {
  const response = await fetch(getAnalysisApiUrl('/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, bugInput }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.jobId) {
    throw new Error(data.message || data.error || 'Failed to start analysis');
  }
  return data.jobId;
}

export async function startFullScan(repoUrl) {
  return startAnalysis(repoUrl, { type: 'fullScan' });
}

export async function getAnalysisResult(jobId) {
  const response = await fetch(getAnalysisApiUrl(`/analyze/${jobId}/result`));
  const data = await response.json().catch(() => ({}));
  if (response.status === 202) return null;
  if (!response.ok || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error(data.message || data.error || 'Analysis returned an invalid graph');
  }
  return data;
}

export function subscribeToAnalysis(jobId, { onStage, onDone, onError }) {
  const source = new EventSource(getAnalysisApiUrl(`/analyze/${jobId}/events`));
  let closed = false;
  source.addEventListener('stage', (event) => {
    try {
      onStage?.(JSON.parse(event.data));
    } catch {
      onError?.(new Error('Analysis service returned malformed progress data'));
    }
  });
  source.addEventListener('done', async () => {
    source.close();
    try {
      let result = null;
      for (let attempt = 0; attempt < 6 && !result; attempt += 1) {
        result = await getAnalysisResult(jobId);
        if (!result) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!result) throw new Error('Analysis result was not ready');
      onDone?.(result);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Analysis failed'));
    }
  });
  source.addEventListener('job_error', (event) => {
    source.close();
    if (closed) return;
    let message = 'Analysis service reported an error';
    try { message = JSON.parse(event.data).message || message; } catch { /* malformed payload */ }
    onError?.(new Error(message));
  });
  // Fallback: connection-level errors (network drop, CORS, etc.)
  source.addEventListener('error', () => {
    if (closed) return;
    closed = true;
    source.close();
    onError?.(new Error('Lost connection to analysis service'));
  });
  return () => {
    closed = true;
    source.close();
  };
}

export { getAnalysisApiUrl };
