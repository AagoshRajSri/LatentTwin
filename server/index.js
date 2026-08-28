const express = require('express');
const { getGraph, traverse, simulateBreak } = require('./graph');
const { generateRepair } = require('./repair');
const { simulateBreakWithContext } = require('./simulate');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/graph', (req, res) => {
  res.json(getGraph());
});

app.get('/api/graph/traverse', (req, res) => {
  const startNode = req.query.start || 'auth-service';
  const result = traverse(startNode);
  res.json(result);
});

app.post('/api/simulate-break', (req, res) => {
  if (req.body && req.body.property && req.body.newProperty) {
    // Advanced break simulation for the new requirements
    const result = simulateBreakWithContext(req.body);
    res.json(result);
  } else {
    // Fallback to older behavior
    const { target = 'auth-service', change = 'rename user_id to userId' } = req.body || {};
    const result = simulateBreak(target, change);
    res.json(result);
  }
});

app.post('/api/repair', (req, res) => {
  if (req.body && req.body.property && req.body.newProperty) {
    const changeDesc = `rename ${req.body.property} to ${req.body.newProperty}`;
    const result = generateRepair(req.body.target || 'auth-service', changeDesc);
    res.json(result);
  } else {
    const { target = 'auth-service', change = 'rename user_id to userId' } = req.body || {};
    const result = generateRepair(target, change);
    res.json(result);
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LatentTwin server running on port ${PORT}`);
  });
}

module.exports = app;
