# Repo Analysis Service

A lightweight Fastify+TypeScript service that takes a GitHub repo URL (and optional bug input) and produces a JSON dependency graph matching exactly what LatentTwin's `CrossSectionNode` component consumes.

## Quick Start

```bash
cd repo-analysis-service
cp .env.example .env
# Fill in GITHUB_TOKEN and ANTHROPIC_API_KEY in .env
npm install
npm run dev   # dev with hot-reload via tsx
npm run build # production build
npm start     # run compiled output
```

Runs on **port 3001** by default (configurable via `PORT` env var). The existing LatentTwin Express server runs on port 5000 — no conflict.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `GITHUB_TOKEN` | — | GitHub PAT — increases API rate limit from 60→5000 req/hr; required for private repos |
| `ANTHROPIC_API_KEY` | — | Required for LLM tier classification and bug diagnosis. Without it the service still produces graphs but skips LLM steps. |
| `MAX_CONCURRENT_JOBS` | `3` | p-queue concurrency cap for analysis jobs |
| `MAX_FILES` | `5000` | Hard rejection limit — repos over this count get a 4xx |
| `CACHE_DIR` | OS temp dir | Where computed graphs are cached |
| `CACHE_MAX_SIZE_MB` | `2048` | LRU eviction ceiling |
| `CACHE_TTL_HOURS` | `24` | Cache entry TTL |
| `CLONE_TIMEOUT_MS` | `30000` | Hard timeout for `git clone` |
| `LLM_CONCURRENCY` | `5` | Max concurrent Anthropic API calls |

## API Endpoints

### `POST /analyze`
Start an analysis job. Returns immediately.
```json
// Request
{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main",
  "githubToken": "optional",
  "bugInput": {
    "type": "stackTrace | testFailure | description",
    "content": "..."
  }
}
// Response: 202
{ "jobId": "uuid" }
```

### `GET /analyze/:jobId/events`
SSE stream of pipeline progress:
```
event: stage
data: {"stage":"cloning","pct":10}

event: done
data: {"jobId":"uuid"}
```

### `GET /analyze/:jobId/result`
Final graph JSON — directly consumed by the frontend.

### `GET /health`

## Example curl

```bash
# Start job
JOB=$(curl -s -X POST http://localhost:3001/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/expressjs/express"}' | jq -r .jobId)

# Stream progress
curl -N "http://localhost:3001/analyze/$JOB/events"

# Fetch result
curl "http://localhost:3001/analyze/$JOB/result" | jq '.nodes | length'
```

## Architecture

```
POST /analyze
    ↓
Stage 1: resolveRepo  → GitHub API (owner, SHA, branch)
Stage 2: fetchRepo    → GitHub trees API (fast, no disk) OR git shallow clone (fallback)
Stage 3: buildGraph   → oxc-parser (Rust) or regex; parallel across CPU cores
Stage 4: classifyTiers → convention patterns first, Haiku LLM batch fallback (~50 files/call)
Stage 5: diagnoseBug  → stack-trace parse (no LLM) or Sonnet structured JSON
Stage 6: assembleResult → CrossSectionNode-compatible graph JSON, write to cache
```

## Frontend Integration

The service output at `GET /analyze/:jobId/result` maps directly to the `layers` prop of `CrossSectionNode`:
- Each `node` in `nodes[]` becomes a layer
- `node.lines[]` becomes the line items with `before`/`after`/`hint` diff UI
- `node.status` drives the `⚠ Impacted` badge

In `App.jsx`, add a "Analyze Repo" button that calls `POST /analyze` on the service (port 3001), polls the SSE stream, then pushes the result nodes into the React Flow graph as `crossSection` type nodes.

## Performance Notes

- **Cache hit**: < 200ms (pure JSON read, no clone/LLM)
- **Small public repo (< 100 files)**: 2–5s for clone + graph, 8–20s with LLM steps
- **Large repo (500 files)**: 5–8s non-LLM path. LLM adds 5–15s on top (concurrent calls).
- Repos over 5,000 files are rejected with a clear 4xx rather than hanging.
