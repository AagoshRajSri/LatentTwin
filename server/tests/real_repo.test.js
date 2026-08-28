const assert = require('node:assert');
const { test } = require('node:test');
const { Scanner } = require('../scanner/scanner');
const { GraphBuilder } = require('../scanner/graphBuilder');
const path = require('path');
const config = require('../config');
const { simulateBreakWithContext } = require('../simulate');
const { generateRepair } = require('../repair');

test('Scanner finds explicitly requested extensions and package.json', () => {
  const repoPath = path.resolve(__dirname, '../../demo-system');
  const scanner = new Scanner(repoPath);
  const files = scanner.scan();
  
  assert.ok(files.length > 0, 'Should find files in demo-system');
  assert.ok(files.some(f => f.path.includes('index.js')), 'Should find js files');
});

test('GraphBuilder discovers nodes and edges in demo-system', () => {
  const repoPath = path.resolve(__dirname, '../../demo-system');
  const builder = new GraphBuilder(repoPath);
  const graph = builder.build();
  
  assert.ok(graph.nodes.find(n => n.id === 'auth-service'), 'Should find auth-service node');
  assert.ok(graph.nodes.find(n => n.id === 'worker-service'), 'Should find worker-service node');
  assert.ok(graph.nodes.find(n => n.id === 'event-queue'), 'Should find event-queue node');
  
  // Verify relationships
  assert.ok(graph.edges.find(e => e.source === 'auth-service' && e.target === 'event-queue'), 'Auth publishes to queue');
  assert.ok(graph.edges.find(e => e.source === 'event-queue' && e.target === 'worker-service'), 'Worker subscribes to queue');
});

test('simulateBreakWithContext finds property occurrences in files', () => {
  const result = simulateBreakWithContext({
    target: 'auth-service',
    property: 'user_id',
    newProperty: 'userId'
  });
  
  assert.ok(result.affectedNodes.includes('worker-service'));
  assert.ok(result.relevantFiles.length > 0, 'Should find relevant files with user_id');
  
  const workerFile = result.relevantFiles.find(f => f.path.includes('worker-service'));
  assert.ok(workerFile, 'Should find occurrence in worker-service');
  assert.ok(workerFile.lines.length > 0, 'Should identify line numbers');
});

test('generateRepair dynamically produces unified diff from real file content', () => {
  const result = generateRepair('auth-service', 'rename user_id to userId');
  
  assert.strictEqual(result.affectedService, 'Worker Service');
  assert.ok(result.diff.includes('--- a/worker-service/index.js'), 'Diff should target the real file path');
  assert.ok(result.diff.includes('-      const userId = payload.user_id;'), 'Diff should remove old property');
  assert.ok(result.diff.includes('+      const userId = payload.userId;'), 'Diff should add new property');
  assert.ok(result.diff.includes('schema_version'), 'Diff should preserve surrounding context like schema_version');
});

test('Configuration falls back gracefully to static graph if REPO_PATH is invalid', () => {
  const originalRepoPath = config.repoPath;
  config.repoPath = '/path/does/not/exist';
  
  const { getGraph } = require('../graph');
  const graph = getGraph();
  
  assert.strictEqual(graph.nodes.length, 3, 'Should fallback to static 3 nodes');
  assert.strictEqual(graph.edges.length, 2, 'Should fallback to static 2 edges');
  
  // Restore for other tests
  config.repoPath = originalRepoPath;
});
