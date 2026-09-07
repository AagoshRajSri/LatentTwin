# Security & Environment Configuration Guide

## 🔐 GitHub Token Management

### Creating a Personal Access Token (PAT)

#### For Public Repositories Only
1. Go to https://github.com/settings/tokens/new
2. Select scopes: `public_repo`
3. Create token
4. Add to `.env`: `GITHUB_TOKEN=ghp_xxxxx`

#### For Private Repositories
1. Go to https://github.com/settings/tokens/new
2. Select scopes: `repo` (full access)
3. Create token
4. Add to `.env`: `GITHUB_TOKEN=ghp_xxxxx`

#### Fine-Grained Tokens (GitHub Enterprise / Newer Accounts)
1. Go to https://github.com/settings/personal-access-tokens/new
2. Name: "LatentTwin"
3. Expiration: 30 days (recommended for rotation)
4. Repository access: "All repositories" or select specific repos
5. Repository access: select only the repositories LatentTwin should analyze.
6. Permissions needed:
   - Contents: Read-only
   - Metadata: Read-only
7. Copy token and add to `.env`: `GITHUB_TOKEN=github_pat_xxxxx`

### Token Security Best Practices

**DO:**
- ✅ Rotate tokens every 30 days
- ✅ Use fine-grained tokens with minimal scopes
- ✅ Store tokens in `.env` files (added to `.gitignore`)
- ✅ Use different tokens for different environments (dev, staging, prod)
- ✅ Monitor token usage in GitHub Settings → Applications
- ✅ Revoke tokens immediately if exposed

**DON'T:**
- ❌ Commit tokens to Git
- ❌ Include tokens in error messages or logs
- ❌ Share tokens via Slack/email
- ❌ Use the same token for multiple services
- ❌ Give tokens broader scopes than necessary

### Token Validation

The server automatically validates tokens at startup:

```bash
# Valid token will show:
✓ GitHub token validated. Scopes: repo,read:org

# Invalid/missing token will show:
❌ FATAL CONFIGURATION ERRORS:
   - GITHUB_TOKEN environment variable is not set
   - Invalid GITHUB_TOKEN: GitHub token format is invalid
```

## 🔑 API Keys Configuration

### Gemini API Key

1. Get key from https://makersuite.google.com/app/apikeys
2. Add to `.env`: `GEMINI_API_KEY=AQ.Ab8RN6LNVSH...`
3. Never commit to repository
4. Rotate keys regularly
5. Monitor usage in Google Cloud Console

### LLM7 API Key (Optional Alternative)

1. If using LLM7 instead of Gemini
2. Add to `.env`: `LLM7_API_KEY=xxx`
3. Set concurrency: `LLM_CONCURRENCY=3`

## 📋 Environment Variables Reference

### Server (.env)

```env
# GitHub Access
GITHUB_TOKEN=ghp_xxxxx or github_pat_xxxxx

# Backend API (Express)
PORT=5000
NODE_ENV=development

# Frontend URLs (CORS)
FRONTEND_URL=http://localhost:5173
FRONTEND_URLS=http://localhost:5173,https://example.com

# Analysis Service
VITE_ANALYSIS_API_URL=http://localhost:3001

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

### Repo Analysis Service (.env)

```env
# GitHub Access
GITHUB_TOKEN=ghp_xxxxx or github_pat_xxxxx

# AI/LLM
GEMINI_API_KEY=AQ.Ab8RN6LNVSH...
LLM7_API_KEY=xxx (optional)
LLM_CONCURRENCY=5

# Service
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Caching
CACHE_DIR=.cache
CACHE_MAX_SIZE_MB=2048
CACHE_TTL_HOURS=24

# Cloning
CLONE_TIMEOUT_MS=30000

# Limits
MAX_CONCURRENT_JOBS=3
MAX_FILES=5000
FREE_TIER_MAX_REPO_SIZE_KB=50000
```

### Frontend (.env)

```env
# API endpoints
VITE_API_URL=http://localhost:5000
VITE_ANALYSIS_API_URL=http://localhost:3001

# Feature flags
VITE_ENABLE_3D=true
VITE_ENABLE_PARTICLE_WAVE=true
```

## 🔒 Security Checklist

### Pre-Deployment

- [ ] All tokens in `.env`, not in code
- [ ] `.env` added to `.gitignore`
- [ ] `.env.example` created with placeholder values
- [ ] Token scopes validated in GitHub UI
- [ ] Rate limiting enabled
- [ ] CORS configured for production domain
- [ ] Error messages don't expose sensitive data
- [ ] HTTPS enforced in production
- [ ] Secrets rotated before deployment

### Runtime

- [ ] Tokens logged as hashes, not plaintext
- [ ] All API errors return safe messages
- [ ] Path traversal protection in file operations
- [ ] Input validation on all routes
- [ ] Rate limits enforced
- [ ] Workspace cleanup verified after each operation

### Monitoring

- [ ] Error logs reviewed daily
- [ ] Token usage monitored in GitHub
- [ ] API quota monitoring (Gemini, GitHub)
- [ ] Rate limit violations logged

## ⚠️ Error Handling

### Safe Error Messages

Instead of:
```javascript
❌ "GitHub API error: Invalid token ghp_xxxxxxxxxxxxx"
```

Use:
```javascript
✅ "GitHub API error: Invalid token (ghp_****...***)"
✅ "GitHub authentication failed. Check token permissions."
```

### Error Redaction

All sensitive data is automatically redacted:

```javascript
import { redactToken, logTokenError } from './lib/tokenManager';

const token = process.env.GITHUB_TOKEN;
console.log(`Using token: ${redactToken(token)}`); 
// Output: Using token: ghp_****...***
```

## 🚀 Deployment

### Environment-Specific Configuration

**Development**
```env
NODE_ENV=development
LOG_LEVEL=debug
```

**Staging**
```env
NODE_ENV=staging
LOG_LEVEL=info
FRONTEND_URL=https://staging.example.com
```

**Production**
```env
NODE_ENV=production
LOG_LEVEL=warn
FRONTEND_URL=https://example.com
# Use production GitHub token with limited scope
```

### GitHub Actions Secret Setup

1. Go to repo Settings → Secrets and variables → Actions
2. Add secrets:
   - `GITHUB_TOKEN` (production PAT)
   - `GEMINI_API_KEY`
   - `LLM7_API_KEY` (if needed)

```yaml
# In workflow file
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## 🔍 Validation Commands

### Check Token Format
```bash
# Before deploying, verify token format
node -e "
const tm = require('./server/lib/tokenManager');
const token = process.env.GITHUB_TOKEN;
const result = tm.validateGitHubToken(token);
console.log(result);
"
```

### Check Configuration
```bash
# Startup will automatically validate
npm start
# Look for:
# ✓ GitHub token validated
# ✓ Environment configuration valid
```

## 📞 Support

If you see authentication errors:

1. Verify token is in `.env` (not `.env.example`)
2. Check token hasn't expired in GitHub settings
3. Confirm token has required scopes (repo, read:org)
4. Try regenerating a new token
5. Check firewall/network isn't blocking GitHub API

## Related Files

- Error Handler: `server/middleware/errorHandler.js`
- Validation Middleware: `server/middleware/validation.js`
- Token Manager: `server/lib/tokenManager.js`
- Rate Limiter: `repo-analysis-service/src/lib/rateLimit.ts`
