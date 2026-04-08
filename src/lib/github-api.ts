// Direct GitHub public REST API client for the demo
// Hard-coded to homeles/github-network-explorer (no auth required)

export const OWNER = 'homeles';
export const REPO = 'github-network-explorer';

const BASE = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github.v3+json',
};

// ─── Interfaces (same as client/src/lib/api.ts) ───────────────────────────

export interface GitActor {
  name: string | null;
  email: string | null;
  avatarUrl: string;
  user?: { login: string } | null;
}

export interface CommitParent {
  oid: string;
}

export interface CommitNode {
  oid: string;
  abbreviatedOid: string;
  message: string;
  committedDate: string;
  author: GitActor | null;
  parents: { nodes: CommitParent[] };
  additions: number;
  deletions: number;
  associatedPullRequests?: {
    nodes: Array<{
      number: number;
      title: string;
      state: string;
      headRefName?: string;
      baseRefName?: string;
      mergeCommit?: { oid: string } | null;
      url?: string;
    }>;
  };
}

export interface CommitDetail extends CommitNode {
  committer: GitActor | null;
  changedFilesIfAvailable: number | null;
  associatedPullRequests: {
    nodes: Array<{
      number: number;
      title: string;
      state: string;
      url: string;
      headRefName?: string;
      baseRefName?: string;
      mergeCommit?: { oid: string } | null;
    }>;
  };
  statusCheckRollup: { state: string } | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface CommitsPage {
  nodes: CommitNode[];
  pageInfo: PageInfo;
}

export interface RepoOverview {
  defaultBranchRef: { name: string } | null;
  branches: { name: string }[];
  tags: { name: string }[];
  stargazerCount: number;
  forkCount: number;
  watcherCount: number;
  description: string | null;
  isPrivate: boolean;
}

export interface BranchInfo {
  name: string;
  isDefault: boolean;
  lastCommitMessage: string;
  lastCommitDate: string;
  lastCommitAuthor: {
    name: string | null;
    login: string | null;
    avatarUrl: string;
  };
  aheadBy: number;
  behindBy: number;
  isProtected: boolean;
}

export interface DirectoryStats {
  path: string;
  additions: number;
  deletions: number;
  changes: number;
  commitCount: number;
  files: number;
  children: DirectoryStats[];
}

export interface CodeFrequencyData {
  timeSeries: Array<{
    weekStart: string;
    additions: number;
    deletions: number;
    commitCount: number;
  }>;
  directoryBreakdown: DirectoryStats[];
  topFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
    changes: number;
    commitCount: number;
  }>;
  contributors: Array<{
    login: string | null;
    name: string | null;
    avatarUrl: string;
    additions: number;
    deletions: number;
    commitCount: number;
  }>;
  totalCommitsAnalyzed: number;
  period: { since: string; until: string };
}

// ─── REST API response types ──────────────────────────────────────────────

interface RestUser {
  login: string;
  avatar_url: string;
}

interface RestCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
  };
  author: RestUser | null;
  committer: RestUser | null;
  parents: Array<{ sha: string }>;
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{
    filename: string;
    additions: number;
    deletions: number;
    changes: number;
    status: string;
  }>;
}

interface RestBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

interface RestRepo {
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  subscribers_count: number;
  description: string | null;
  private: boolean;
}

interface RestTag {
  name: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────

function parseLinkHeader(link: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!link) return result;
  for (const part of link.split(',')) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      result[match[2]!] = match[1]!;
    }
  }
  return result;
}

async function ghFetch<T>(url: string, retries = 3): Promise<T> {
  const response = await fetch(url, { headers: HEADERS });

  if (response.status === 202) {
    // Stats being computed by GitHub, retry after delay
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return ghFetch<T>(url, retries - 1);
    }
    throw new Error(
      'GitHub is still computing statistics. Please wait a moment and try again.'
    );
  }

  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const reset = response.headers.get('x-ratelimit-reset');
      const resetTime = reset
        ? new Date(parseInt(reset) * 1000).toLocaleTimeString()
        : 'soon';
      throw new Error(
        `GitHub API rate limit exceeded (60 req/hr for unauthenticated requests). ` +
          `Rate limit resets at ${resetTime}. Please wait and try again.`
      );
    }
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message ?? 'GitHub API: access forbidden');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message ?? `GitHub API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function ghFetchRaw(url: string, retries = 3): Promise<Response> {
  const response = await fetch(url, { headers: HEADERS });

  if (response.status === 202) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return ghFetchRaw(url, retries - 1);
    }
    throw new Error(
      'GitHub is still computing statistics. Please wait a moment and try again.'
    );
  }

  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const reset = response.headers.get('x-ratelimit-reset');
      const resetTime = reset
        ? new Date(parseInt(reset) * 1000).toLocaleTimeString()
        : 'soon';
      throw new Error(
        `GitHub API rate limit exceeded (60 req/hr). Resets at ${resetTime}.`
      );
    }
  }

  return response;
}

// ─── Data mappers ─────────────────────────────────────────────────────────

function mapCommit(c: RestCommit): CommitNode {
  return {
    oid: c.sha,
    abbreviatedOid: c.sha.slice(0, 7),
    message: c.commit.message,
    committedDate: c.commit.committer.date,
    author: {
      name: c.commit.author.name,
      email: c.commit.author.email,
      avatarUrl: c.author?.avatar_url ?? '',
      user: c.author ? { login: c.author.login } : null,
    },
    parents: { nodes: c.parents.map((p) => ({ oid: p.sha })) },
    additions: 0,
    deletions: 0,
  };
}

function mapCommitDetail(c: RestCommit): CommitDetail {
  return {
    oid: c.sha,
    abbreviatedOid: c.sha.slice(0, 7),
    message: c.commit.message,
    committedDate: c.commit.committer.date,
    author: {
      name: c.commit.author.name,
      email: c.commit.author.email,
      avatarUrl: c.author?.avatar_url ?? '',
      user: c.author ? { login: c.author.login } : null,
    },
    committer: {
      name: c.commit.committer.name,
      email: c.commit.committer.email,
      avatarUrl: c.committer?.avatar_url ?? '',
      user: c.committer ? { login: c.committer.login } : null,
    },
    parents: { nodes: c.parents.map((p) => ({ oid: p.sha })) },
    additions: c.stats?.additions ?? 0,
    deletions: c.stats?.deletions ?? 0,
    changedFilesIfAvailable: c.files?.length ?? null,
    associatedPullRequests: { nodes: [] },
    statusCheckRollup: null,
  };
}

// ─── API functions ────────────────────────────────────────────────────────

export const api = {
  repos: {
    overview: async (): Promise<RepoOverview> => {
      const [repoData, branchData, tagData] = await Promise.all([
        ghFetch<RestRepo>(`${BASE}/repos/${OWNER}/${REPO}`),
        ghFetch<RestBranch[]>(`${BASE}/repos/${OWNER}/${REPO}/branches?per_page=100`),
        ghFetch<RestTag[]>(`${BASE}/repos/${OWNER}/${REPO}/tags?per_page=30`).catch(
          () => [] as RestTag[]
        ),
      ]);

      return {
        defaultBranchRef: { name: repoData.default_branch },
        branches: branchData.map((b) => ({ name: b.name })),
        tags: tagData.map((t) => ({ name: t.name })),
        stargazerCount: repoData.stargazers_count,
        forkCount: repoData.forks_count,
        watcherCount: repoData.subscribers_count,
        description: repoData.description,
        isPrivate: repoData.private,
      };
    },

    commits: async (branch: string, cursor?: string): Promise<CommitsPage> => {
      // cursor is either undefined (first page) or the "next" URL from Link header
      const url =
        cursor ??
        `${BASE}/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(branch)}&per_page=50`;

      const response = await ghFetchRaw(url);

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          body.message ?? `GitHub API error: ${response.status}`
        );
      }

      const data = (await response.json()) as RestCommit[];
      const linkHeader = response.headers.get('Link');
      const links = parseLinkHeader(linkHeader);

      return {
        nodes: data.map(mapCommit),
        pageInfo: {
          hasNextPage: !!links['next'],
          endCursor: links['next'] ?? null,
        },
      };
    },

    commitDetail: async (sha: string): Promise<CommitDetail> => {
      const data = await ghFetch<RestCommit>(
        `${BASE}/repos/${OWNER}/${REPO}/commits/${sha}`
      );
      return mapCommitDetail(data);
    },

    branches: async (): Promise<BranchInfo[]> => {
      // 1. Get repo info (for default branch)
      const repoData = await ghFetch<RestRepo>(`${BASE}/repos/${OWNER}/${REPO}`);
      const defaultBranch = repoData.default_branch;

      // 2. Get all branches
      const branchList = await ghFetch<RestBranch[]>(
        `${BASE}/repos/${OWNER}/${REPO}/branches?per_page=100`
      );

      // 3. For each branch, get last commit info (per_page=1 includes user info)
      const branchInfos = await Promise.all(
        branchList.map(async (branch) => {
          // Get last commit for this branch
          const commits = await ghFetch<RestCommit[]>(
            `${BASE}/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(branch.name)}&per_page=1`
          );
          const lastCommit = commits[0];

          let aheadBy = 0;
          let behindBy = 0;

          // Get ahead/behind for non-default branches
          if (branch.name !== defaultBranch && lastCommit) {
            try {
              const compareData = await ghFetch<{
                ahead_by: number;
                behind_by: number;
              }>(
                `${BASE}/repos/${OWNER}/${REPO}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch.name)}`
              );
              aheadBy = compareData.ahead_by;
              behindBy = compareData.behind_by;
            } catch {
              // Ignore compare errors (branch may be deleted or inaccessible)
            }
          }

          return {
            name: branch.name,
            isDefault: branch.name === defaultBranch,
            lastCommitMessage: lastCommit?.commit.message ?? '',
            lastCommitDate: lastCommit?.commit.committer.date ?? '',
            lastCommitAuthor: {
              name: lastCommit?.commit.author.name ?? null,
              login: lastCommit?.author?.login ?? null,
              avatarUrl: lastCommit?.author?.avatar_url ?? '',
            },
            aheadBy,
            behindBy,
            isProtected: branch.protected,
          } satisfies BranchInfo;
        })
      );

      // Sort: default first, then by last commit date
      return branchInfos.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return (
          new Date(b.lastCommitDate).getTime() -
          new Date(a.lastCommitDate).getTime()
        );
      });
    },

    codeFrequency: async (options?: {
      since?: string;
      until?: string;
    }): Promise<CodeFrequencyData> => {
      // Use GitHub's stats endpoints (don't support date filtering, returns all-time)
      const [freqData, contribData] = await Promise.all([
        ghFetch<Array<[number, number, number]>>(
          `${BASE}/repos/${OWNER}/${REPO}/stats/code_frequency`
        ),
        ghFetch<
          Array<{
            author: RestUser;
            total: number;
            weeks: Array<{ w: number; a: number; d: number; c: number }>;
          }>
        >(`${BASE}/repos/${OWNER}/${REPO}/stats/contributors`),
      ]);

      // Map [timestamp, additions, deletions] → timeSeries (deletions are negative)
      let timeSeries = (freqData ?? [])
        .filter((w) => w[1] !== 0 || w[2] !== 0)
        .map((w) => ({
          weekStart: new Date(w[0]! * 1000).toISOString().slice(0, 10),
          additions: w[1] ?? 0,
          deletions: Math.abs(w[2] ?? 0),
          commitCount: 0,
        }));

      // Apply client-side time range filtering if provided
      if (options?.since || options?.until) {
        const since = options.since ? new Date(options.since) : null;
        const until = options.until ? new Date(options.until) : null;
        timeSeries = timeSeries.filter((p) => {
          const d = new Date(p.weekStart);
          if (since && d < since) return false;
          if (until && d > until) return false;
          return true;
        });
      }

      // Map contributors
      const contributors = (contribData ?? [])
        .map((c) => ({
          login: c.author.login,
          name: null,
          avatarUrl: c.author.avatar_url,
          additions: c.weeks.reduce((sum, w) => sum + w.a, 0),
          deletions: c.weeks.reduce((sum, w) => sum + w.d, 0),
          commitCount: c.total,
        }))
        .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));

      const totalCommits = contributors.reduce(
        (sum, c) => sum + c.commitCount,
        0
      );

      const period = {
        since: timeSeries[0]?.weekStart ?? '',
        until: timeSeries[timeSeries.length - 1]?.weekStart ?? '',
      };

      return {
        timeSeries,
        directoryBreakdown: [],
        topFiles: [],
        contributors,
        totalCommitsAnalyzed: totalCommits,
        period,
      };
    },
  },
};
