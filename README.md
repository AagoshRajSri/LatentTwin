# <img src="client/public/logo.png" alt="LatentTwin Logo" width="40" height="40" align="center" /> LatentTwin

> LatentTwin converts LatentGraph’s JSON context graph into an interactive, visual 3D/2D "Living Digital Twin" of your application architecture.

---

## ✨ Features

- **🌐 Interactive 2D & 3D Graphing**: Dynamic architecture visualization powered by ReactFlow & Three.js.
- **🌊 Particle Wave Overlay**: Google Stitch-inspired particle wave animation for all loading & scanning states.
- **🤖 Autonomous AI Diagnostics**: Deep repository bug scanning & tier classification powered by Gemini LLM.
- **🛠️ 1-Click AI Code Repair**: Targeted code patch synthesis directly from detected bug lines & stack traces.
- **⚡ Rate & Size Limits**: Built-in 50MB repo size checks and 24h AI repair rate limiting.

---

## 📁 Project Structure

- **`client/`**: React + Vite frontend with Tailwind CSS, ReactFlow & Three.js 3D visualizer.
- **`repo-analysis-service/`**: Fastify microservice for GitHub repo fetching, AST graph parsing & Gemini diagnostics.
- **`server/`**: Execution runner & automated patch verification engine.
- **`demo-system/`**: Multi-service microservice ecosystem for offline demonstration.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install frontend & service dependencies
cd client && npm install
cd ../repo-analysis-service && npm install
```

### 2. Environment Setup

Add your Gemini API key in `repo-analysis-service/.env`:

```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key
```

For a deployed frontend, deploy `repo-analysis-service` separately and set
`VITE_ANALYSIS_API_URL` in the frontend hosting provider to its public URL before
building. The browser cannot reach `localhost:3001` on a user's machine. If the
frontend host provides a reverse proxy for `/analyze`, `/health`, and the other
analysis routes, the variable may be left empty.

### 3. Run LatentTwin

```bash
# Terminal 1: Backend Analysis Microservice
cd repo-analysis-service && npm run dev

# Terminal 2: Frontend Dashboard
cd client && npm run dev
```

## Service API

LatentTwin currently uses two services rather than a single gateway:

- Express application API: `http://localhost:5000/api/*`
- Fastify repository analysis API: `http://localhost:3001/analyze` or `http://localhost:3001/api/analyze`

The analysis API returns a job ID from `POST /analyze`. Progress and the final
graph are streamed from `GET /analyze/:jobId/events` as Server-Sent Events.
`repo-analysis-service/openapi.json` contains the public analysis API contract.

The frontend uses `VITE_API_URL` for the Express API and
`VITE_ANALYSIS_API_URL` for the Fastify API. In production, set both to public
HTTPS URLs or configure a reverse proxy for `/api`, `/analyze`, and
`/health`. Browser clients must never receive `GITHUB_TOKEN` or an LLM API key.

## Configuration

`.env` is loaded by each Node service. Frontend variables belong in
`client/.env` and must use the `VITE_` prefix. `.env.example` files document
defaults; real `.env` files override those examples and must not be committed.
The analysis cache defaults to a 24-hour TTL and is bounded by
`CACHE_MAX_SIZE_MB`. Both services apply IP-based request limits; a `429`
response includes `Retry-After`.

Run the full local verification suite with:

```bash
npm test
cd repo-analysis-service && npm run build
cd ../client && npm run lint && npm run build
```
