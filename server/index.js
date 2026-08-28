const express = require('express');
const { getGraph, traverse, simulateBreak } = require('./graph');

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
  const { target = 'auth-service', change = 'rename user_id to userId' } = req.body || {};
  const result = simulateBreak(target, change);
  res.json(result);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LatentTwin server running on port ${PORT}`);
  });
}

module.exports = app;
