import { simpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveRepo, fetchTreeViaApi, fetchFileContent, type RepoMeta, type TreeFile } from '../lib/githubClient.js';

export const MAX_FILES = parseInt(process.env.MAX_FILES ?? '5000');
const CLONE_TIMEOUT_MS = parseInt(process.env.CLONE_TIMEOUT_MS ?? '60000'); // Bump to 60s for larger clones
const MAX_REPO_SIZE_MB = parseInt(process.env.MAX_REPO_SIZE_MB ?? '10000'); // Default to 10GB to allow large repos
const MAX_REPO_SIZE_KB = MAX_REPO_SIZE_MB * 1024;

const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.py']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv']);

export interface FetchedFile {
  path: string;
  content: string;
}

export interface FetchResult {
  meta: RepoMeta;
  files: FetchedFile[];
  tmpDir?: string; // present if we cloned to disk (caller must delete)
}

export async function fetchRepo(
  repoUrl: string,
  branch: string | undefined,
  token: string | undefined
): Promise<FetchResult> {
  const meta = await resolveRepo(repoUrl, branch, token);

  if (meta.sizeKb > MAX_REPO_SIZE_KB) {
    throw new Error(`Repo is ${Math.round(meta.sizeKb / 1024)} MB — exceeds the configured limit of ${MAX_REPO_SIZE_MB} MB.`);
  }

  // Retrieve repo tree via GitHub REST API — may throw TREE_TOO_LARGE or API_AUTH_FAILURE
  let tree: import('../lib/githubClient.js').TreeFile[] | null;
  try {
    tree = await fetchTreeViaApi(meta.owner, meta.name, meta.commitSha, token);
  } catch (e: any) {
    if (e?.code === 'TREE_TOO_LARGE') {
      throw new Error(`Repository tree is too large to retrieve via the standard GitHub API. This requires local Git cloning (exceeds the configured limit).`);
    }
    if (e?.code === 'API_AUTH_FAILURE') {
      throw new Error(e.message);
    }
    throw e;
  }

  if (!tree) {
    throw new Error(`Failed to retrieve repository tree. Please verify the repository URL and your GITHUB_TOKEN.`);
  }

  const sourceFiles = tree.filter((f) => isSourceFile(f.path));
  if (sourceFiles.length > MAX_FILES) {
    throw new Error(`Repo has ${sourceFiles.length.toLocaleString()} source files — exceeds the ${MAX_FILES.toLocaleString()} file limit.`);
  }

  // Fetch all source file contents via REST API
  try {
    const files = await fetchContentsViaApi(meta.owner, meta.name, meta.commitSha, sourceFiles, token);
    return { meta, files };
  } catch (err) {
    throw new Error(`Failed to fetch file contents: ${err instanceof Error ? err.message : 'Unknown API error'}. Installing Git on the host system or configuring a valid GITHUB_TOKEN may resolve this.`);
  }
}

async function fetchContentsViaApi(
  owner: string,
  name: string,
  sha: string,
  treeFiles: TreeFile[],
  token: string | undefined
): Promise<FetchedFile[]> {
  const results: FetchedFile[] = [];
  // Fetch in parallel, but cap at 10 concurrent to avoid rate limits
  const BATCH = 10;
  for (let i = 0; i < treeFiles.length; i += BATCH) {
    const batch = treeFiles.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (f) => {
        const content = await fetchFileContent(owner, name, f.path, sha, token);
        return content !== null ? { path: f.path, content } : null;
      })
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
  }
  return results;
}

async function cloneAndRead(meta: RepoMeta, token: string | undefined): Promise<FetchResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-clone-'));
  try {
    const cloneUrl = token
      ? meta.cloneUrl.replace('https://', `https://${token}@`)
      : meta.cloneUrl;

    const git = simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } });
    await git.clone(cloneUrl, tmpDir, [
      '--depth', '1',
      '--branch', meta.defaultBranch,
      '--single-branch',
    ]);

    const files = readDirRecursive(tmpDir, tmpDir);
    if (files.length > MAX_FILES) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(`Repo has ${files.length.toLocaleString()} files — exceeds the ${MAX_FILES.toLocaleString()} limit.`);
    }

    // Delete clone after extracting contents; keep only computed JSON in cache
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { meta, files };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

function readDirRecursive(rootDir: string, dir: string): FetchedFile[] {
  const results: FetchedFile[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    // Reject symlinks to prevent path traversal
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      results.push(...readDirRecursive(rootDir, fullPath));
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      // Guard against path traversal in relative path
      if (relPath.includes('..')) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        results.push({ path: relPath, content });
      } catch {
        // Skip unreadable files
      }
    }
  }
  return results;
}

function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}
