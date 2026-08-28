const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../index');

test('POST /api/repair generates repair information for user_id to userId rename', async (t) => {
  const response = await request(app)
    .post('/api/repair')
    .send({
      target: 'auth-service',
      change: 'rename user_id to userId'
    });
  
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.detectedChange, 'user_id → userId');
  assert.strictEqual(response.body.affectedService, 'Worker Service');
  assert.ok(response.body.dependencyPath.includes('auth-service'));
  assert.ok(response.body.dependencyPath.includes('worker-service'));
  assert.strictEqual(response.body.historicalInvariants.length, 3);
  assert.ok(response.body.diff.includes('-      const userId = payload.user_id;'));
  assert.ok(response.body.diff.includes('+      const userId = payload.userId;'));
  assert.ok(response.body.diff.includes('const schemaVersion = payload.schema_version;'));
});
