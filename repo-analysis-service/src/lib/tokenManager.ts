/**
 * GitHub Token Manager for Fastify Service
 * Securely handles GitHub Personal Access Tokens (PAT)
 */

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

/**
 * Validate GitHub token format
 */
export function validateGitHubToken(token: string | undefined): {
  valid: boolean;
  error?: string;
  type: 'classic' | 'fine-grained' | 'oauth' | 'unknown';
} {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      error: 'Token is required',
      type: 'unknown',
    };
  }

  const trimmed = token.trim();

  // GitHub Classic PAT starts with ghp_
  if (trimmed.startsWith('ghp_')) {
    if (trimmed.length < 36) {
      return {
        valid: false,
        error: 'GitHub token format is invalid',
        type: 'classic',
      };
    }
    return { valid: true, type: 'classic' };
  }

  // GitHub Fine-grained PAT starts with github_pat_
  if (trimmed.startsWith('github_pat_')) {
    if (trimmed.length < 40) {
      return {
        valid: false,
        error: 'GitHub token format is invalid',
        type: 'fine-grained',
      };
    }
    return { valid: true, type: 'fine-grained' };
  }

  return {
    valid: false,
    error: 'Unrecognized GitHub token format',
    type: 'unknown',
  };
}

/**
 * Redact token for safe logging
 */
export function redactToken(token: string): string {
  if (!token || token.length < 8) return '****';
  const start = token.substring(0, 4);
  const end = token.substring(token.length - 3);
  return `${start}...${end}`;
}

/**
 * Verify environment configuration at startup
 */
export function verifyEnvironmentConfig(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check GitHub token
  const gitHubToken = process.env.GITHUB_TOKEN;
  if (!gitHubToken) {
    errors.push(
      'GITHUB_TOKEN environment variable is required. ' +
      'Create a PAT at https://github.com/settings/tokens'
    );
  } else {
    const validation = validateGitHubToken(gitHubToken);
    if (!validation.valid) {
      errors.push(`Invalid GITHUB_TOKEN format: ${validation.error}`);
    }
  }

  // Check API keys
  const geminiKey = process.env.GEMINI_API_KEY;
  const llm7Key = process.env.LLM7_API_KEY;
  if (!geminiKey && !llm7Key) {
    warnings.push(
      'No AI API key configured (GEMINI_API_KEY or LLM7_API_KEY). ' +
      'Detailed bug diagnosis will be disabled.'
    );
  }

  // Check port
  const port = process.env.PORT;
  if (port && isNaN(Number(port))) {
    errors.push('PORT must be a valid number');
  }

  if (errors.length > 0) {
    console.error('\n❌ CONFIGURATION ERRORS:');
    errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  CONFIGURATION WARNINGS:');
    warnings.forEach((warn) => console.warn(`   - ${warn}`));
  }

  console.log('✓ Environment configuration valid');
}
