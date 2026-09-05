import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = process.env.CACHE_DIR ?? path.join(os.tmpdir(), 'latent-twin-cache');
const CACHE_MAX_SIZE_BYTES = parseInt(process.env.CACHE_MAX_SIZE_MB ?? '2048') * 1024 * 1024;
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_HOURS ?? '24') * 60 * 60 * 1000;

fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheKeyToPath(key: string): string {
  // key: "owner/repo@sha" → sanitize for filesystem
  return path.join(CACHE_DIR, key.replace(/[/\\@:]/g, '_') + '.json');
}

export function cacheGet(key: string): unknown | null {
  const filePath = cacheKeyToPath(key);
  try {
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) {
      fs.unlinkSync(filePath);
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    // Touch the file to reset TTL
    const now = new Date();
    fs.utimesSync(filePath, now, now);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  const filePath = cacheKeyToPath(key);
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
  evictIfNeeded();
}

function evictIfNeeded(): void {
  try {
    const files = fs.readdirSync(CACHE_DIR).map((f) => {
      const full = path.join(CACHE_DIR, f);
      const stat = fs.statSync(full);
      return { full, size: stat.size, mtime: stat.mtimeMs };
    });

    // Evict expired first
    const now = Date.now();
    for (const f of files) {
      if (now - f.mtime > CACHE_TTL_MS) {
        fs.unlinkSync(f.full);
      }
    }

    // Then LRU by total size
    let totalSize = files.reduce((s, f) => s + f.size, 0);
    if (totalSize <= CACHE_MAX_SIZE_BYTES) return;

    const sorted = [...files].sort((a, b) => a.mtime - b.mtime);
    for (const f of sorted) {
      if (totalSize <= CACHE_MAX_SIZE_BYTES) break;
      fs.unlinkSync(f.full);
      totalSize -= f.size;
    }
  } catch {
    // Non-fatal — eviction failure should not crash the service
  }
}
