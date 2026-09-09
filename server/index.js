const express = require('express');
const crypto = require('node:crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { getGraph, traverse, simulateBreak } = require('./graph');
const { generateRepair } = require('./repair');
const { simulateBreakWithContext } = require('./simulate');
const { createIsolatedWorkspace, cleanupIsolatedWorkspace, applyPatch, runValidation } = require('./runner');
const config = require('./config');
const { errorHandler, asyncHandler, AppError } = require('./middleware/errorHandler');
const { validateRepoUrl, validateBugInput, validatePatch, validateLegacyOperation, validateGitHubToken } = require('./middleware/validation');

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

app.set('trust proxy', 1);
app.use(express.json());
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    console.log('[HTTP]', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
    });
  });
  next();
});

const strictPaths = [
  '/api/simulate-break',
  '/api/repair',
  '/api/apply-patch'
];

const rateLimitHandler = (req, res, next, options) => {
  const resetTime = req.rateLimit.resetTime;
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((resetTime - Date.now()) / 1000)
  );

  res.setHeader('Retry-After', retryAfterSeconds.toString());

  res.status(429).json({
    error: "rate_limit_exceeded",
    message: "Too many requests. You have exceeded the configured request limit.",
    retry_after_seconds: retryAfterSeconds,
    limit: options.max,
    window: "900s",
    reset_at: resetTime.toISOString()
  });
};

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000, // Increased for development (Vite HMR can easily exceed 100 requests)
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => {
    const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
    return strictPaths.includes(pathname);
  }
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

app.use('/api', standardLimiter);

strictPaths.forEach(path => {
  app.use(path, strictLimiter);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/graph', asyncHandler((req, res) => {
  try {
    const graph = getGraph();
    if (!graph) {
      throw new AppError('Failed to retrieve graph data', 500, 'GRAPH_RETRIEVAL_FAILED');
    }
    res.json(graph);
  } catch (err) {
    throw new AppError(err.message || 'Failed to get graph', 500, 'GRAPH_ERROR');
  }
}));

app.get('/api/graph/traverse', asyncHandler((req, res) => {
  try {
    const startNode = req.query.start || 'auth-service';
    
    if (typeof startNode !== 'string' || startNode.trim().length === 0) {
      throw new AppError('Invalid start node parameter', 400, 'INVALID_START_NODE');
    }

    const result = traverse(startNode);
    if (!result) {
      throw new AppError('Traversal failed', 500, 'TRAVERSAL_FAILED');
    }
    
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || 'Failed to traverse graph', 500, 'TRAVERSE_ERROR');
  }
}));

app.post('/api/simulate-break', validateLegacyOperation, asyncHandler((req, res) => {
  try {
    if (!req.body) {
      throw new AppError('Request body is required', 400, 'MISSING_REQUEST_BODY');
    }

    const result = req.body.property && req.body.newProperty
      ? simulateBreakWithContext(req.body)
      : simulateBreak(req.body.target || 'auth-service', req.body.change || 'rename user_id to userId');
    
    if (!result) {
      throw new AppError('Failed to simulate break', 500, 'SIMULATION_FAILED');
    }

    res.json(result);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || 'Simulation error', 500, 'SIMULATE_BREAK_ERROR');
  }
}));

app.post('/api/repair', validateLegacyOperation, asyncHandler((req, res) => {
  try {
    if (!req.body) {
      throw new AppError('Request body is required', 400, 'MISSING_REQUEST_BODY');
    }

    const result = req.body.property && req.body.newProperty
      ? generateRepair(req.body.target || 'auth-service', `rename ${req.body.property} to ${req.body.newProperty}`)
      : generateRepair(req.body.target || 'auth-service', req.body.change || 'rename user_id to userId');
    
    if (!result) {
      throw new AppError('Failed to generate repair', 500, 'REPAIR_GENERATION_FAILED');
    }

    res.json(result);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || 'Repair generation error', 500, 'REPAIR_ERROR');
  }
}));

app.post('/api/apply-patch', validatePatch, asyncHandler((req, res) => {
  const { repairInfo } = req.body;

  if (!repairInfo || !repairInfo.targetFilePath) {
    throw new AppError('Missing repair information or target file path', 400, 'MISSING_REPAIR_INFO');
  }

  const repoPath = config.isValidRepo() ? config.getRepoPath() : require('path').join(__dirname, '..', 'demo-system');
  let workspacePath;

  try {
    workspacePath = createIsolatedWorkspace(repoPath);
    
    if (!workspacePath) {
      throw new AppError('Failed to create isolated workspace', 500, 'WORKSPACE_CREATION_FAILED');
    }

    // Determine target file path
    let targetFilePath = repairInfo.targetFilePath;
    if (!targetFilePath && repairInfo.diff && repairInfo.diff.includes('demo-system/worker-service/index.js')) {
      targetFilePath = 'worker-service/index.js';
    } else if (targetFilePath) {
      const repoName = require('path').basename(repoPath);
      if (targetFilePath.startsWith(repoName + '/')) {
        targetFilePath = targetFilePath.substring(repoName.length + 1);
      }
    }

    if (!targetFilePath) {
      throw new AppError('Could not determine target file path for patch', 400, 'INVALID_TARGET_FILE');
    }

    // Apply patch
    applyPatch(workspacePath, targetFilePath, repairInfo);

    // Validate
    const validationResult = runValidation(workspacePath, targetFilePath);

    res.json({
      status: validationResult.success ? 'SYSTEM HEALED' : 'REPAIR FAILED',
      message: validationResult.success 
        ? 'Repair applied and validated successfully.' 
        : 'Validation failed after applying patch.',
      validationResult
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    
    const message = err.message || 'Unknown error during patch application';
    throw new AppError(message, 500, 'PATCH_APPLICATION_ERROR');
  } finally {
    if (workspacePath) {
      try {
        const cleaned = cleanupIsolatedWorkspace(workspacePath);
        if (!cleaned) {
          console.error('[CLEANUP_ERROR]', { workspacePath, message: 'Workspace cleanup was not confirmed' });
        }
      } catch (cleanupErr) {
        console.error('[CLEANUP_ERROR]', { workspacePath, message: cleanupErr.message });
      }
    }
  }
}));

// 404 handler
app.use((req, res, next) => {
  throw new AppError(`Route not found: ${req.method} ${req.path}`, 404, 'ROUTE_NOT_FOUND');
});

// Error handling middleware (MUST be last)
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LatentTwin server running on ${PORT}`);
  });
}

module.exports = app;
