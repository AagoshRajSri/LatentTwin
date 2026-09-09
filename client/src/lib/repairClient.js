const getApiUrl = (endpoint) => {
  const base = import.meta.env.VITE_API_URL || '';
  const cleanEndpoint = endpoint.replace(/^\//, '');
  return base ? `${base.replace(/\/$/, '')}/${cleanEndpoint}` : `/${cleanEndpoint}`;
};

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || fallback);
  return data;
}

export async function generateRepair(target, change) {
  const response = await fetch(getApiUrl('/api/repair'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, change }),
  });
  return readResponse(response, 'Repair generation failed');
}

export async function applyRepair(repairInfo) {
  const response = await fetch(getApiUrl('/api/apply-patch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repairInfo }),
  });
  return readResponse(response, 'Patch application failed');
}
