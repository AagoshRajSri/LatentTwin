const fs = require('fs');
const path = require('path');

const QUEUE_DIR = process.env.QUEUE_DIR || path.join(__dirname, '../queue-data');
const QUEUE_FILE = path.join(QUEUE_DIR, 'events.json');

function consumeEvents() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(QUEUE_FILE, 'utf8');
    const events = JSON.parse(data);
    
    return events.map(entry => {
      const payload = entry.payload || {};
      const userId = payload.user_id;
      const schemaVersion = payload.schema_version;
      return {
        timestamp: entry.timestamp,
        user_id: userId,
        schema_version: schemaVersion,
        raw: payload
      };
    });
  } catch (e) {
    return [];
  }
}

if (require.main === module) {
  const processed = consumeEvents();
  console.log(`Consumed ${processed.length} events:`, JSON.stringify(processed, null, 2));
}

module.exports = {
  consumeEvents,
  QUEUE_FILE
};
