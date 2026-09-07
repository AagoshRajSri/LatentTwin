const getApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_API_URL || '';
  const cleanEndpoint = endpoint.replace(/^\//, '');
  return base ? `${base.replace(/\/$/, '')}/${cleanEndpoint}` : `/${cleanEndpoint}`;
};

export async function simulateBreak({ target = 'auth-service', change = 'rename user_id to userId' } = {}) {
  const response = await fetch(getApiUrl('/api/simulate-break'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, change }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.affectedNodes) || !Array.isArray(data.dependencyPath)) {
    throw new Error(data.message || data.error || 'Simulation failed');
  }
  return data;
}
