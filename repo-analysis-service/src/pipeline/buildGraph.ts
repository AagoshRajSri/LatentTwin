import os from 'node:os';
import path from 'node:path';
import type { FetchedFile } from './fetchRepo.js';

export interface ImportEdge {
  source: string;
  target: string;
}

export interface FileGraph {
  edges: ImportEdge[];
  fileSet: Set<string>;
}

// Regexes for JS/TS import extraction (oxc-parser unavailable in some envs; this is the fast fallback)
const IMPORT_RE = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const PY_IMPORT_RE = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;

// Try to load oxc-parser — Rust-based, order-of-magnitude faster for large repos.
// Fall back silently if not available.
let oxcParse: ((source: string) => { imports: Array<{ moduleRequest: { value: string } }> }) | null = null;
try {
// @ts-ignore
  const mod: any = await import('oxc-parser').catch(() => null);
  if (mod && typeof mod.parseSync === 'function') {
    oxcParse = mod.parseSync;
  }
} catch {
  // oxc-parser not available; regex fallback will be used
}

export async function buildGraph(files: FetchedFile[]): Promise<FileGraph> {
  const fileSet = new Set(files.map((f) => f.path));
  const edges: ImportEdge[] = [];

  // Run in parallel across CPUs
  const BATCH = Math.max(1, Math.min(os.cpus().length - 1, 8));
  const batches: FetchedFile[][] = [];
  for (let i = 0; i < files.length; i += BATCH) {
    batches.push(files.slice(i, i + BATCH));
  }

  const batchResults = await Promise.all(batches.map((batch) => processBatch(batch, fileSet)));
  for (const batchEdges of batchResults) {
    edges.push(...batchEdges);
  }

  return { edges, fileSet };
}

async function processBatch(files: FetchedFile[], fileSet: Set<string>): Promise<ImportEdge[]> {
  const edges: ImportEdge[] = [];
  for (const file of files) {
    const fileEdges = parseFileImports(file, fileSet);
    edges.push(...fileEdges);
  }
  return edges;
}

function parseFileImports(file: FetchedFile, fileSet: Set<string>): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const ext = path.extname(file.path).toLowerCase();

  if (ext === '.py') {
    const imports = extractPythonImports(file.content, file.path, fileSet);
    for (const target of imports) {
      edges.push({ source: file.path, target });
    }
    return edges;
  }

  // JS/TS
  let imports: string[] = [];
  if (oxcParse) {
    try {
      const result = oxcParse(file.content);
      imports = result.imports.map((i) => i.moduleRequest.value);
    } catch {
      // oxc failed on this file — fallback to regex
      imports = extractJsImportsRegex(file.content);
    }
  } else {
    imports = extractJsImportsRegex(file.content);
  }

  for (const importPath of imports) {
    if (importPath.startsWith('.')) {
      const resolved = resolveRelativeImport(file.path, importPath, fileSet);
      if (resolved) edges.push({ source: file.path, target: resolved });
    }
  }

  return edges;
}

function extractJsImportsRegex(content: string): string[] {
  const imports: string[] = [];
  let match: RegExpExecArray | null;

  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }

  REQUIRE_RE.lastIndex = 0;
  while ((match = REQUIRE_RE.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }

  return imports;
}

function extractPythonImports(content: string, filePath: string, fileSet: Set<string>): string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;
  PY_IMPORT_RE.lastIndex = 0;
  while ((match = PY_IMPORT_RE.exec(content)) !== null) {
    const moduleName = match[1] ?? match[2];
    if (!moduleName) continue;
    // Convert dotted module to file path guess
    const base = moduleName.replace(/\./g, '/');
    for (const candidate of [`${base}.py`, `${base}/__init__.py`]) {
      if (fileSet.has(candidate)) {
        targets.push(candidate);
        break;
      }
    }
  }
  return targets;
}

function resolveRelativeImport(
  fromFile: string,
  importPath: string,
  fileSet: Set<string>
): string | null {
  const dir = path.dirname(fromFile);
  // Try common extensions
  const candidates = [
    importPath,
    `${importPath}.ts`,
    `${importPath}.tsx`,
    `${importPath}.js`,
    `${importPath}.jsx`,
    `${importPath}/index.ts`,
    `${importPath}/index.js`,
  ];

  for (const candidate of candidates) {
    const resolved = path.posix.normalize(`${dir}/${candidate}`);
    if (fileSet.has(resolved)) return resolved;
  }
  return null;
}
