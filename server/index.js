const express = require('express');
const { getGraph, traverse } = require('./graph');

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LatentTwin server running on port ${PORT}`);
  });
}

module.exports = app;
