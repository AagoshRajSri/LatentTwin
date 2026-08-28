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

function makePostRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const url = new URL(baseUrl + path);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: JSON.parse(body)
        });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
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

test('POST /api/simulate-break simulates breaking change and returns affected nodes, path, and invariants', async () => {
  const res = await makePostRequest('/api/simulate-break', {
    target: 'auth-service',
    change: 'rename user_id to userId'
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.target, 'auth-service');
  assert.strictEqual(res.body.change, 'rename user_id to userId');
  assert.deepStrictEqual(res.body.affectedNodes, ['auth-service', 'event-queue', 'worker-service']);
  assert.deepStrictEqual(res.body.dependencyPath, ['auth-service', 'event-queue', 'worker-service']);
  assert.ok(Array.isArray(res.body.relevantInvariants));
  assert.ok(res.body.relevantInvariants.some(inv => inv.pr === 'PR #51'));
});
