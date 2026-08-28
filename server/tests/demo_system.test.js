const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const QUEUE_DIR = path.join(__dirname, 'temp-queue');
process.env.QUEUE_DIR = QUEUE_DIR;

const { createUserEvent } = require('../../demo-system/auth-service/index');
const { consumeEvents } = require('../../demo-system/worker-service/index');

test('Auth Service produces event and Worker Service consumes it', () => {
  if (fs.existsSync(QUEUE_DIR)) {
    fs.rmSync(QUEUE_DIR, { recursive: true, force: true });
  }

  const produced = createUserEvent("123", "1");
  assert.strictEqual(produced.user_id, "123");
  assert.strictEqual(produced.schema_version, "1");

  const consumed = consumeEvents();
  assert.strictEqual(consumed.length, 1);
  assert.strictEqual(consumed[0].user_id, "123");
  assert.strictEqual(consumed[0].schema_version, "1");

  if (fs.existsSync(QUEUE_DIR)) {
    fs.rmSync(QUEUE_DIR, { recursive: true, force: true });
  }
});
