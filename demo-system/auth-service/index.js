const fs = require('fs');
const path = require('path');

const QUEUE_DIR = process.env.QUEUE_DIR || path.join(__dirname, '../queue-data');
const QUEUE_FILE = path.join(QUEUE_DIR, 'events.json');

function ensureQueueDir() {
  if (!fs.existsSync(QUEUE_DIR)) {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
  }
}

function produceEvent(event) {
  ensureQueueDir();
  let events = [];
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      const data = fs.readFileSync(QUEUE_FILE, 'utf8');
      events = JSON.parse(data);
    } catch (e) {
      events = [];
    }
  }
  events.push({
    timestamp: new Date().toISOString(),
    payload: event
  });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(events, null, 2), 'utf8');
  return event;
}

function createUserEvent(userId = "123", schemaVersion = "1") {
  const event = {
    user_id: userId,
    schema_version: schemaVersion
  };
  return produceEvent(event);
}

if (require.main === module) {
  const event = createUserEvent();
  console.log('Produced event:', JSON.stringify(event));
}

module.exports = {
  produceEvent,
  createUserEvent,
  QUEUE_FILE
};
