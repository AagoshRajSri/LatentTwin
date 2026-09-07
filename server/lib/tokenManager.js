const crypto = require('node:crypto');

function validateGitHubToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, error: 'Token is required', type: 'unknown' };
  }

  const value = token.trim();
  if (value.startsWith('ghp_')) {
    return { valid: value.length >= 36, error: value.length >= 36 ? undefined : 'Token is too short', type: 'classic' };
  }
  if (value.startsWith('github_pat_')) {
    return { valid: value.length >= 40, error: value.length >= 40 ? undefined : 'Token is too short', type: 'fine-grained' };
  }
  if (/^[a-f0-9]{40}$/.test(value)) {
    return { valid: true, type: 'oauth' };
  }
  return { valid: false, error: 'Unrecognized GitHub token format', type: 'unknown' };
}

function redactToken(token) {
  if (typeof token !== 'string' || token.length < 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-3)}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validateEnvironment() {
  const errors = [];
  const warnings = [];
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    warnings.push('GITHUB_TOKEN is not set; private repository access is unavailable.');
  } else {
    const result = validateGitHubToken(token);
    if (!result.valid) errors.push(`Invalid GITHUB_TOKEN: ${result.error}`);
  }

  if (!process.env.GEMINI_API_KEY && !process.env.LLM7_API_KEY) {
    warnings.push('No AI API key is configured; AI analysis is disabled.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function logTokenError(error, token, context) {
  console.error('[TOKEN_ERROR]', {
    timestamp: new Date().toISOString(),
    context,
    tokenHash: token ? hashToken(token) : undefined,
    tokenRedacted: token ? redactToken(token) : undefined,
    error: error.message,
  });
}

module.exports = {
  validateGitHubToken,
  redactToken,
  hashToken,
  validateEnvironment,
  logTokenError,
};
