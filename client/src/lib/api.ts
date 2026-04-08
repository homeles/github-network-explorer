// Typed fetch helpers for all API endpoints

export interface ApiError {
  error: string;
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

export interface AuthStatus {
  authenticated: boolean;
  user?: {
    login: string;
    avatarUrl: string;
    name: string | null;
  };
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
  auth: {
    status: () => apiFetch<AuthStatus>('/api/auth/status'),
    initiateLogin: () =>
      apiFetch<{ url: string }>('/api/auth/github', { method: 'POST' }),
    logout: () => apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  },
  repos: {
    list: (page = 1, perPage = 30) =>
      apiFetch<ReposPage>(`/api/repos?type=owner&page=${page}&per_page=${perPage}`),
    overview: (owner: string, repo: string) =>
      apiFetch<RepoOverview>(`/api/repos/${owner}/${repo}/overview`),
    commits: (owner: string, repo: string, branch: string, cursor?: string) =>
      apiFetch<CommitsPage>(
        `/api/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      ),
    commitDetail: (owner: string, repo: string, sha: string) =>
      apiFetch<CommitDetail>(`/api/repos/${owner}/${repo}/commit/${sha}`),
    pullRequests: (owner: string, repo: string, state = 'OPEN') =>
      apiFetch<PullRequest[]>(`/api/repos/${owner}/${repo}/pulls?state=${state}`),
  },
  orgs: {
    list: () => apiFetch<UserOrg[]>('/api/orgs'),
    repos: (org: string, page = 1, perPage = 30) =>
      apiFetch<ReposPage>(`/api/orgs/${encodeURIComponent(org)}/repos?page=${page}&per_page=${perPage}`),
  },
};
