const { GraphBuilder } = require('./scanner/graphBuilder');
const config = require('./config');

const nodes = [
  {
    id: "auth-service",
    name: "Auth Service",
    type: "service",
    description: "Authenticates users and produces user activity events."
  },
  {
    id: "event-queue",
    name: "Event Queue",
    type: "queue",
    description: "File-backed event message queue."
  },
  {
    id: "worker-service",
    name: "Worker Service",
    type: "service",
    description: "Consumes user events and processes downstream tasks."
  }
];

const edges = [
  {
    source: "auth-service",
    target: "event-queue",
    type: "publishes",
    description: "Publishes user events to event queue."
  },
  {
    source: "event-queue",
    target: "worker-service",
    type: "subscribes",
    description: "Consumes user events from event queue (implicit runtime dependency from auth-service to worker-service)."
  }
];

const prInvariants = [
  {
    pr: "PR #42",
    description: "Queue payload must include schema_version",
    target: "event-queue"
  },
  {
    pr: "PR #51",
    description: "Consumers must preserve user_id field",
    target: "worker-service"
  },
  {
    pr: "PR #63",
    description: "Event schema changes require consumer updates",
    target: "auth-service"
  }
];

function getGraph() {
  if (config.isValidRepo()) {
    const builder = new GraphBuilder(config.getRepoPath());
    const dynamicGraph = builder.build();
    if (dynamicGraph) return dynamicGraph;
  }
  
  return {
    nodes,
    edges,
    prInvariants
  };
}

function traverse(startNodeId) {
  const graph = getGraph();
  const visited = new Set();
  const path = [];

  function dfs(currentId) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    path.push(currentId);

    const outgoingEdges = graph.edges.filter(e => e.source === currentId);
    for (const edge of outgoingEdges) {
      dfs(edge.target);
    }
  }

  dfs(startNodeId);
  return {
    startNodeId,
    visitedNodes: Array.from(visited),
    path
  };
}

function simulateBreak(targetNodeId, changeDescription) {
  const graph = getGraph();
  const traversal = traverse(targetNodeId);
  const affectedNodes = traversal.visitedNodes;
  const path = traversal.path;

  // Filter historical PR invariants relevant to target or affected nodes
  const relevantInvariants = graph.prInvariants.filter(inv => affectedNodes.includes(inv.target));

  return {
    target: targetNodeId,
    change: changeDescription,
    affectedNodes,
    dependencyPath: path,
    relevantInvariants
  };
}

module.exports = {
  getGraph,
  traverse,
  simulateBreak,
  nodes,
  edges,
  prInvariants
};
