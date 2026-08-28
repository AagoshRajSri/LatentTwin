const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../index');
const { traverse, getGraph } = require('../graph');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: JSON.parse(data)
        });
      });
    }).on('error', reject);
  });
}

test('GET /api/health returns status ok', async () => {
  const res = await makeRequest('/api/health');
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { status: 'ok' });
});

test('GET /api/graph returns complete architecture graph and PR invariants', async () => {
  const res = await makeRequest('/api/graph');
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.nodes));
  assert.ok(Array.isArray(res.body.edges));
  assert.ok(Array.isArray(res.body.prInvariants));

  const nodeIds = res.body.nodes.map(n => n.id);
  assert.ok(nodeIds.includes('auth-service'));
  assert.ok(nodeIds.includes('event-queue'));
  assert.ok(nodeIds.includes('worker-service'));

  const invariants = res.body.prInvariants.map(inv => inv.pr);
  assert.ok(invariants.includes('PR #42'));
  assert.ok(invariants.includes('PR #51'));
  assert.ok(invariants.includes('PR #63'));
});

test('Graph traversal starting at auth-service reaches worker-service', async () => {
  const traversalResult = traverse('auth-service');
  assert.deepStrictEqual(traversalResult.path, ['auth-service', 'event-queue', 'worker-service']);
  assert.ok(traversalResult.visitedNodes.includes('worker-service'));
});

test('GET /api/graph/traverse endpoint returns traversal path', async () => {
  const res = await makeRequest('/api/graph/traverse?start=auth-service');
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.path, ['auth-service', 'event-queue', 'worker-service']);
});
