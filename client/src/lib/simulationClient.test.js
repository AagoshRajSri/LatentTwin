import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simulateBreak } from './simulationClient.js';

describe('simulationClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns validated simulation data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ affectedNodes: ['auth-service'], dependencyPath: ['auth-service'] }),
    }));
    await expect(simulateBreak()).resolves.toEqual({ affectedNodes: ['auth-service'], dependencyPath: ['auth-service'] });
  });

  it('rejects malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(simulateBreak()).rejects.toThrow('Simulation failed');
  });
});