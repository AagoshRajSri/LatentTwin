import { Octokit } from '@octokit/rest';

export function createOctokit(token?: string): Octokit {
  // Token never logged, never echoed
  return new Octokit({ 
    auth: token ?? process.env.GITHUB_TOKEN ?? undefined,
    request: { timeout: 30000 }
  });
}

export interface RepoMeta {
  owner: string;
  name: string;
  defaultBranch: string;
  commitSha: string;
  private: boolean;
  sizeKb: number;
  cloneUrl: string;
}

export async function resolveRepo(
  repoUrl: string,
  branch: string | undefined,
  token: string | undefined
): Promise<RepoMeta> {
  const octokit = createOctokit(token);
  const cleanUrl = repoUrl.trim().replace(/\/$/, '');
  const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error('Could not parse GitHub URL');
  const [, owner, rawName] = match as [string, string, string];
  const name = rawName.replace(/\.git$/i, '');

  const { data: repo } = await octokit.repos.get({ owner, repo: name });

  const resolvedBranch = branch ?? repo.default_branch;
  const { data: branchData } = await octokit.repos.getBranch({
    owner,
    repo: name,
    branch: resolvedBranch,
  });

  return {
    owner,
    name,
    defaultBranch: resolvedBranch,
    commitSha: branchData.commit.sha,
    private: repo.private,
    sizeKb: repo.size ?? 0,
    cloneUrl: repo.clone_url ?? repoUrl,
  };
}

export interface TreeFile {
  path: string;
  size?: number;
  url?: string;
}

/**
 * Fetch the full git tree (flat) for small-medium public repos via REST API.
 * Throws 'TREE_TOO_LARGE' if the tree is truncated (repo too big for API).
 * Throws 'API_AUTH_FAILURE' if GitHub returns 401/403 (rate limit or bad token).
 * Returns null on other network failures.
 */
export async function fetchTreeViaApi(
  owner: string,
  name: string,
  sha: string,
  token: string | undefined
): Promise<TreeFile[] | null> {
  const octokit = createOctokit(token);
  try {
    const { data } = await octokit.git.getTree({
      owner,
      repo: name,
      tree_sha: sha,
      recursive: '1',
    });
    if (data.truncated) {
      const err = new Error('Repository tree is too large to retrieve via the GitHub API.');
      (err as any).code = 'TREE_TOO_LARGE';
      throw err;
    }
    return (data.tree ?? [])
      .filter((item) => item.type === 'blob' && item.path !== undefined)
      .map((item) => ({ path: item.path as string, size: item.size }));
  } catch (e: any) {
    // Re-throw our own typed errors
    if (e?.code === 'TREE_TOO_LARGE') throw e;
    // GitHub 401/403 = bad token or rate limit
    if (e?.status === 401 || e?.status === 403) {
      const authErr = new Error(
        e.status === 403
          ? 'GitHub API rate limit exceeded or access denied (403). Add or refresh your GITHUB_TOKEN in the .env file.'
          : 'GitHub API authentication failed (401). Your GITHUB_TOKEN may be invalid or expired.'
      );
      (authErr as any).code = 'API_AUTH_FAILURE';
      throw authErr;
    }
    // Any other failure — treat as transient, return null
    return null;
  }
}

export async function fetchFileContent(
  owner: string,
  name: string,
  path: string,
  ref: string,
  token: string | undefined
): Promise<string | null> {
  const octokit = createOctokit(token);
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: name, path, ref });
    if (Array.isArray(data) || data.type !== 'file') return null;
    return Buffer.from(data.content ?? '', 'base64').toString('utf8');
  } catch {
    return null;
  }
}
