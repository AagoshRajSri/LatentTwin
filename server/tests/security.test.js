const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRepoUrl, validateBugInput, validateLegacyOperation } = require('../middleware/validation');
const { validateGitHubToken, redactToken } = require('../lib/tokenManager');

function runMiddleware(middleware, body) {
  return new Promise((resolve) => {
    const req = { body };
    const res = {};
    middleware(req, res, (error) => resolve(error || null));
  });
}

test('validation accepts HTTPS GitHub repository URLs only', async () => {
  assert.equal(await runMiddleware(validateRepoUrl, { repoUrl: 'https://github.com/octocat/Hello-World' }), null);
  assert.equal((await runMiddleware(validateRepoUrl, { repoUrl: 'http://github.com/octocat/Hello-World' })).code, 'INVALID_REPO_URL');
  assert.equal((await runMiddleware(validateRepoUrl, { repoUrl: 'https://gitlab.com/user/repo' })).code, 'INVALID_REPO_URL');
});

test('validation rejects incomplete bug input and change pairs', async () => {
  assert.equal((await runMiddleware(validateBugInput, { bugInput: { type: 'description' } })).code, 'INVALID_BUG_INPUT');
  assert.equal((await runMiddleware(validateLegacyOperation, { property: 'user_id' })).code, 'INCOMPLETE_CHANGE');
  assert.equal(await runMiddleware(validateLegacyOperation, { property: 'user_id', newProperty: 'userId' }), null);
});

test('token validation supports GitHub token prefixes without exposing values', () => {
  assert.equal(validateGitHubToken('github_pat_' + 'a'.repeat(35)).valid, true);
  assert.equal(validateGitHubToken('ghp_' + 'a'.repeat(32)).valid, true);
  assert.equal(validateGitHubToken('not-a-token').valid, false);
  assert.equal(redactToken('github_pat_abcdefghijklmnop'), 'gith...nop');
});