const express = require('express');
const cors = require('cors');
const { getGraph, traverse, simulateBreak } = require('./graph');
const { generateRepair } = require('./repair');
const { simulateBreakWithContext } = require('./simulate');
const { createIsolatedWorkspace, cleanupIsolatedWorkspace, applyPatch, runValidation } = require('./runner');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://latent-twin.vercel.app'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

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

app.post('/api/apply-patch', (req, res) => {
  const { repairInfo } = req.body;
  if (!repairInfo || !repairInfo.targetFilePath) {
    return res.status(400).json({ error: 'Missing repair information or target file path' });
  }

  const repoPath = config.isValidRepo() ? config.getRepoPath() : require('path').join(__dirname, '..', 'demo-system');
  let workspacePath;

  try {
    workspacePath = createIsolatedWorkspace(repoPath);
    
    // Apply patch
    // If it's the fallback static demo repair, the targetFilePath is not provided in generateRepair,
    // we need to set it for the static demo to work.
    let targetFilePath = repairInfo.targetFilePath;
    if (!targetFilePath && repairInfo.diff && repairInfo.diff.includes('demo-system/worker-service/index.js')) {
        targetFilePath = 'worker-service/index.js'; // relative to repoPath
    } else if (targetFilePath) {
        // if targetFilePath includes repo name e.g. demo-system/worker-service/index.js, trim it
        const repoName = require('path').basename(repoPath);
        if (targetFilePath.startsWith(repoName + '/')) {
            targetFilePath = targetFilePath.substring(repoName.length + 1);
        }
    }

    if (!targetFilePath) {
        throw new Error("Could not determine target file path for patch.");
    }

    applyPatch(workspacePath, targetFilePath, repairInfo);

    // Validate
    const validationResult = runValidation(workspacePath, targetFilePath);

    if (validationResult.success) {
      res.json({
        status: 'SYSTEM HEALED',
        message: 'Repair applied and validated successfully.',
        validationResult
      });
    } else {
      res.json({
        status: 'REPAIR FAILED',
        message: 'Validation failed after applying patch.',
        validationResult
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'REPAIR FAILED',
      message: error.message
    });
  } finally {
    if (workspacePath) {
      cleanupIsolatedWorkspace(workspacePath);
    }
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LatentTwin server running on ${PORT}`);
  });
}

module.exports = app;
