// Typed fetch helpers for all API endpoints

export interface ApiError {
  error: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  used: number;
  reset: number; // Unix timestamp when the rate limit resets
}

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

export interface UserRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  updated_at: string;
}

export interface UserOrg {
  login: string;
  avatar_url: string;
  description: string | null;
}

export interface ReposPage {
  repos: UserRepo[];
  page: number;
  per_page: number;
  has_next_page: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: { login: string; avatarUrl: string } | null;
  headRefName: string;
  baseRefName: string;
  commits: { totalCount: number };
  reviews: { totalCount: number };
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

export interface FileChange {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
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
    date: string;
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

export interface CodeFrequencyStreamEvent {
  phase: 'listing' | 'analyzing' | 'complete' | 'error';
  /** Commits listed (listing phase) or analyzed (analyzing phase) so far */
  loaded?: number;
  /** Total commits to analyze; only available during analyzing phase */
  total?: number | null;
  /** Partial aggregated data sent every ~500 commits during analyzing phase */
  partialData?: CodeFrequencyData;
  /** Full data sent with the 'complete' event */
  data?: CodeFrequencyData;
  /** Error message sent with the 'error' event */
  error?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: {
    login: string;
    avatarUrl: string;
    name: string | null;
  };
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: response.statusText,
    }))) as ApiError;
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  rateLimit: () => apiFetch<RateLimitInfo>('/api/rate-limit'),
  auth: {
    status: () => apiFetch<AuthStatus>('/api/auth/status'),
    initiateLogin: () =>
      apiFetch<{ url: string }>('/api/auth/github', { method: 'POST' }),
    logout: () => apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  },
  orgs: {
    list: () => apiFetch<UserOrg[]>('/api/orgs'),
    repos: (org: string, page = 1, perPage = 30) =>
      apiFetch<ReposPage>(`/api/orgs/${encodeURIComponent(org)}/repos?page=${page}&per_page=${perPage}`),
  },
  repos: {
    /** @deprecated Use listPaged for paginated results */
    list: () => apiFetch<UserRepo[]>('/api/repos'),
    listPaged: (page = 1, perPage = 30) =>
      apiFetch<ReposPage>(`/api/repos?page=${page}&per_page=${perPage}`),
    overview: (owner: string, repo: string) =>
      apiFetch<RepoOverview>(`/api/repos/${owner}/${repo}/overview`),
    commits: (owner: string, repo: string, branch: string, cursor?: string, since?: string, until?: string) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (since) params.set('since', since);
      if (until) params.set('until', until);
      const qs = params.toString();
      return apiFetch<CommitsPage>(
        `/api/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}${qs ? `?${qs}` : ''}`
      );
    },
    commitDetail: (owner: string, repo: string, sha: string) =>
      apiFetch<CommitDetail>(`/api/repos/${owner}/${repo}/commit/${sha}`),
    pullRequests: (owner: string, repo: string, state = 'OPEN') =>
      apiFetch<PullRequest[]>(`/api/repos/${owner}/${repo}/pulls?state=${state}`),
    branches: (owner: string, repo: string) =>
      apiFetch<BranchInfo[]>(`/api/repos/${owner}/${repo}/branches`),
    codeFrequency: (
      owner: string,
      repo: string,
      options?: { since?: string; until?: string; path?: string; maxCommits?: number }
    ) => {
      const params = new URLSearchParams();
      if (options?.since) params.set('since', options.since);
      if (options?.until) params.set('until', options.until);
      if (options?.path) params.set('path', options.path);
      if (options?.maxCommits !== undefined) params.set('maxCommits', String(options.maxCommits));
      params.set('tzOffset', String(new Date().getTimezoneOffset()));
      const qs = params.toString();
      return apiFetch<CodeFrequencyData>(
        `/api/repos/${owner}/${repo}/code-frequency${qs ? `?${qs}` : ''}`
      );
    },
    /** Open an SSE stream for incremental code-frequency loading. */
    codeFrequencyStream: (
      owner: string,
      repo: string,
      options?: { since?: string; until?: string; path?: string; maxCommits?: number }
    ): EventSource => {
      const params = new URLSearchParams({ stream: '1' });
      if (options?.since) params.set('since', options.since);
      if (options?.until) params.set('until', options.until);
      if (options?.path) params.set('path', options.path);
      if (options?.maxCommits !== undefined) params.set('maxCommits', String(options.maxCommits));
      params.set('tzOffset', String(new Date().getTimezoneOffset()));
      return new EventSource(`/api/repos/${owner}/${repo}/code-frequency?${params}`);
    },
  },
};
