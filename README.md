# <img src="./logo.png" alt="LatentTwin Logo" width="36" height="36" align="center" /> LatentTwin

Digital twin architectural dependency graph engine for distributed microservice systems.

## Project Structure

- `client/`: Client / UI placeholder (React UI to be implemented).
- `server/`: Express backend API server for LatentTwin architecture graph.
- `demo-system/`: Demo microservice ecosystem.
  - `auth-service/`: Produces user events to file-backed queue.
  - `worker-service/`: Consumes user events from file-backed queue.

## Features

- Express API server on port 5000 (`/api/health`, `/api/graph`).
- In-memory architecture graph representation with PR invariants.
- Graph traversal logic to trace dependencies from source to downstream consumers.
- Demo auth and worker services communicating via local file queue.

## Getting Started

```bash
npm install
npm test
npm start
```
