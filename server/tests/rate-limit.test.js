const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../index');

test('API Rate Limiting', async (t) => {
  let ipCounter = 1;
  const getIp = () => `10.0.0.${ipCounter++}`;

  await t.test('1. Normal /api request', async () => {
    const ip = getIp();
    const res = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', ip);

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['ratelimit-limit']);
    assert.ok(res.headers['ratelimit-remaining']);
    assert.ok(res.headers['ratelimit-reset']);
    assert.strictEqual(res.headers['ratelimit-limit'], '100');
  });

  await t.test('2. Standard limiter', async () => {
    const ip = getIp();
    
    // 100 requests succeed
    for (let i = 0; i < 100; i++) {
      const res = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', ip);
      assert.strictEqual(res.status, 200, `Request ${i + 1} failed`);
    }

    // 101st returns HTTP 429
    const res = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', ip);

    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.error, 'rate_limit_exceeded');
    assert.strictEqual(res.body.message, 'Too many requests. You have exceeded the configured request limit.');
    assert.ok('retry_after_seconds' in res.body);
    assert.strictEqual(typeof res.body.retry_after_seconds, 'number');
    assert.strictEqual(res.body.limit, 100);
    assert.strictEqual(res.body.window, '900s');
    assert.ok('reset_at' in res.body);
    
    // Retry-After header exists
    assert.ok(res.headers['retry-after']);
  });

  await t.test('3. Strict limiter', async () => {
    const ip = getIp();
    const paths = ['/api/simulate-break', '/api/repair'];
    
    // 10 requests distributed across strict paths
    for (let i = 0; i < 10; i++) {
      const path = paths[i % paths.length];
      const res = await request(app)
        .post(path)
        .send({ target: 'auth-service', change: 'rename user_id to userId' })
        .set('X-Forwarded-For', ip);
      assert.strictEqual(res.status, 200, `Strict request ${i + 1} to ${path} failed`);
    }

    // 11th request returns 429
    const res = await request(app)
      .post('/api/simulate-break')
      .send({})
      .set('X-Forwarded-For', ip);

    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.limit, 10);
  });

  await t.test('4. Limiter independence', async () => {
    const ip = getIp();
    
    // 10 strict requests
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/simulate-break')
        .send({ target: 'auth-service', change: 'rename user_id to userId' })
        .set('X-Forwarded-For', ip);
    }
    
    // Strict is exhausted
    const strictRes = await request(app)
      .post('/api/simulate-break')
      .send({ target: 'auth-service', change: 'rename user_id to userId' })
      .set('X-Forwarded-For', ip);
    assert.strictEqual(strictRes.status, 429);

    // standard quota must still begin at 100
    const standardRes = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', ip);
      
    assert.strictEqual(standardRes.status, 200);
    assert.strictEqual(standardRes.headers['ratelimit-remaining'], '99');
  });

  await t.test('5. Query parameter protection', async () => {
    const ip = getIp();
    
    // 10 requests to /api/repair?foo=bar
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/repair?foo=bar')
        .send({ target: 'auth-service', change: 'rename user_id to userId' })
        .set('X-Forwarded-For', ip);
      assert.strictEqual(res.status, 200, `Query param request ${i + 1} failed`);
    }

    // 11th returns 429 with limit: 10
    const res = await request(app)
      .post('/api/repair?foo=bar')
      .send({ target: 'auth-service', change: 'rename user_id to userId' })
      .set('X-Forwarded-For', ip);

    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.limit, 10);
  });
});
