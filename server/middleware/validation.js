/**
 * Input Validation Middleware for Express
 * Validates common request inputs
 */

const { AppError } = require('./errorHandler');

// Repo URL validation schema
const RepoUrlSchema = {
  safeParse({ repoUrl }) {
    try {
      const parsed = new URL(repoUrl);
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
        throw new Error('Only HTTPS GitHub repository URLs are supported');
      }
      return { success: true, data: { repoUrl } };
    } catch (error) {
      return { success: false, error: { errors: [{ message: error.message }] } };
    }
  },
};

// Bug input validation schema
const BugInputSchema = {
  safeParse(value) {
    const validTypes = ['stackTrace', 'description', 'testFailure', 'fullScan'];
    if (!value || !validTypes.includes(value.type)) {
      return { success: false, error: { errors: [{ message: 'Unsupported bug input type' }] } };
    }
    if (value.type !== 'fullScan' && (!value.content || typeof value.content !== 'string')) {
      return { success: false, error: { errors: [{ message: 'Content required for non-fullScan bug types' }] } };
    }
    return { success: true, data: value };
  },
};

/**
 * Validate repository URL format and accessibility
 */
const validateRepoUrl = (req, res, next) => {
  try {
    const { repoUrl } = req.body;
    
    if (!repoUrl) {
      throw new AppError('Repository URL is required', 400, 'MISSING_REPO_URL');
    }

    const validation = RepoUrlSchema.safeParse({ repoUrl });
    if (!validation.success) {
      throw new AppError(
        validation.error.errors[0].message,
        400,
        'INVALID_REPO_URL'
      );
    }

    // Additional checks
    if (repoUrl.length > 512) {
      throw new AppError('Repository URL is too long', 400, 'URL_TOO_LONG');
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Validate bug input structure
 */
const validateBugInput = (req, res, next) => {
  try {
    const { bugInput } = req.body;

    if (!bugInput) {
      throw new AppError('Bug input is required', 400, 'MISSING_BUG_INPUT');
    }

    const validation = BugInputSchema.safeParse(bugInput);
    if (!validation.success) {
      throw new AppError(
        `Invalid bug input: ${validation.error.errors[0].message}`,
        400,
        'INVALID_BUG_INPUT'
      );
    }

    // Validate content length
    if (bugInput.content && bugInput.content.length > 50000) {
      throw new AppError('Bug description is too long (max 50KB)', 400, 'CONTENT_TOO_LONG');
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Validate patch format
 */
const validatePatch = (req, res, next) => {
  try {
    const { repairInfo } = req.body;

    if (!repairInfo) {
      throw new AppError('Patch data is required', 400, 'MISSING_PATCH');
    }

    const targetFilePath = repairInfo.targetFilePath;
    if (targetFilePath && (targetFilePath.includes('..') || targetFilePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(targetFilePath))) {
      throw new AppError('Invalid file path', 400, 'UNSAFE_FILE_PATH');
    }

    next();
  } catch (err) {
    next(err);
  }
};

const validateLegacyOperation = (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AppError('Request body must be a JSON object', 400, 'INVALID_REQUEST_BODY');
    }

    const { target, change, property, newProperty } = req.body;
    for (const [name, value] of Object.entries({ target, change, property, newProperty })) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 500)) {
        throw new AppError(`Invalid ${name} field`, 400, 'INVALID_REQUEST_FIELD');
      }
    }

    if ((property === undefined) !== (newProperty === undefined)) {
      throw new AppError('property and newProperty must be provided together', 400, 'INCOMPLETE_CHANGE');
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Validate GitHub token presence (if required)
 */
const validateGitHubToken = (req, res, next) => {
  try {
    const token = req.body.githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      throw new AppError(
        'GitHub token is required. Provide githubToken in request or set GITHUB_TOKEN env var.',
        400,
        'MISSING_GITHUB_TOKEN'
      );
    }

    if (token.length < 10) {
      throw new AppError('GitHub token appears invalid', 400, 'INVALID_GITHUB_TOKEN');
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  validateRepoUrl,
  validateBugInput,
  validatePatch,
  validateLegacyOperation,
  validateGitHubToken,
  RepoUrlSchema,
  BugInputSchema,
};
