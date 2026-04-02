export interface GitActor {
  name: string | null;
  email: string | null;
  avatarUrl: string;
  user?: {
    login: string;
  } | null;
}

export interface CommitParent {
  oid: string;
}

export interface PullRequestNode {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface CommitNode {
  oid: string;
  abbreviatedOid: string;
  message: string;
  committedDate: string;
  author: GitActor | null;
  parents: {
    nodes: CommitParent[];
  };
  additions: number;
  deletions: number;
}

export interface CommitDetail extends CommitNode {
  committer: GitActor | null;
  changedFilesIfAvailable: number | null;
  associatedPullRequests: {
    nodes: PullRequestNode[];
  };
  statusCheckRollup: {
    state: string;
  } | null;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface CommitsPage {
  nodes: CommitNode[];
  pageInfo: PageInfo;
}

export interface BranchRef {
  name: string;
}

export interface RepoOverview {
  defaultBranchRef: { name: string } | null;
  branches: BranchRef[];
  tags: BranchRef[];
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

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  headRefName: string;
  baseRefName: string;
  commits: { totalCount: number };
  reviews: { totalCount: number };
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
  name: string | null;
}

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    accessToken?: string;
    oauthState?: string;
  }
}
