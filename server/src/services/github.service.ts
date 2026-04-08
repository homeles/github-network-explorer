import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import type {
  RepoOverview,
  CommitsPage,
  CommitDetail,
  PullRequestSummary,
  UserRepo,
  UserOrg,
  ReposPage,
  BranchInfo,
  CodeFrequencyData,
  DirectoryStats,
} from '../types/index.js';

export class GitHubService {
  private graphqlWithAuth: ReturnType<typeof graphql.defaults>;
  private octokit: Octokit;

  constructor(token: string) {
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
    this.octokit = new Octokit({ auth: token });
  }

  async getRepoOverview(owner: string, repo: string): Promise<RepoOverview> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          defaultBranchRef {
            name
          }
          branches: refs(refPrefix: "refs/heads/", first: 100) {
            nodes {
              name
            }
          }
          tags: refs(refPrefix: "refs/tags/", first: 100) {
            nodes {
              name
            }
          }
          stargazerCount
          forkCount
          watchers {
            totalCount
          }
          description
          isPrivate
        }
      }
    `;

    const result = await this.graphqlWithAuth<{
      repository: {
        defaultBranchRef: { name: string } | null;
        branches: { nodes: { name: string }[] };
        tags: { nodes: { name: string }[] };
        stargazerCount: number;
        forkCount: number;
        watchers: { totalCount: number };
        description: string | null;
        isPrivate: boolean;
      };
    }>(query, { owner, repo });

    const r = result.repository;
    return {
      defaultBranchRef: r.defaultBranchRef,
      branches: r.branches.nodes,
      tags: r.tags.nodes,
      stargazerCount: r.stargazerCount,
      forkCount: r.forkCount,
      watcherCount: r.watchers.totalCount,
      description: r.description,
      isPrivate: r.isPrivate,
    };
  }

  async getBranchCommits(
    owner: string,
    repo: string,
    branch: string,
    cursor?: string
  ): Promise<CommitsPage> {
    const query = `
      query($owner: String!, $repo: String!, $branch: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          ref(qualifiedName: $branch) {
            target {
              ... on Commit {
                history(first: 50, after: $cursor) {
                  nodes {
                    oid
                    abbreviatedOid
                    message
                    committedDate
                    author {
                      name
                      email
                      avatarUrl
                      user {
                        login
                      }
                    }
                    parents(first: 10) {
                      nodes {
                        oid
                      }
                    }
                    additions
                    deletions
                    associatedPullRequests(first: 1) {
                      nodes {
                        number
                        title
                        state
                        headRefName
                        baseRefName
                        mergeCommit {
                          oid
                        }
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlWithAuth<{
      repository: {
        ref: {
          target: {
            history: CommitsPage;
          };
        } | null;
      };
    }>(query, { owner, repo, branch, cursor: cursor ?? null });

    const ref = result.repository.ref;
    if (!ref) {
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    }

    return ref.target.history;
  }

  async getCommitDetail(
    owner: string,
    repo: string,
    oid: string
  ): Promise<CommitDetail | null> {
    const query = `
      query($owner: String!, $repo: String!, $oid: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $oid) {
            ... on Commit {
              oid
              abbreviatedOid
              message
              committedDate
              author {
                name
                email
                avatarUrl
                user {
                  login
                }
              }
              committer {
                name
                email
                avatarUrl
                user {
                  login
                }
              }
              additions
              deletions
              changedFilesIfAvailable
              parents(first: 10) {
                nodes {
                  oid
                }
              }
              associatedPullRequests(first: 5) {
                nodes {
                  number
                  title
                  state
                  url
                }
              }
              statusCheckRollup {
                state
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlWithAuth<{
      repository: {
        object: CommitDetail | null;
      };
    }>(query, { owner, repo, oid });

    return result.repository.object;
  }

  async getPullRequests(
    owner: string,
    repo: string,
    state?: string
  ): Promise<PullRequestSummary[]> {
    const states = state ? [state.toUpperCase()] : ['OPEN'];
    const query = `
      query($owner: String!, $repo: String!, $states: [PullRequestState!]) {
        repository(owner: $owner, name: $repo) {
          pullRequests(first: 50, states: $states, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              number
              title
              state
              url
              createdAt
              updatedAt
              author {
                login
                avatarUrl
              }
              headRefName
              baseRefName
              commits {
                totalCount
              }
              reviews {
                totalCount
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlWithAuth<{
      repository: {
        pullRequests: { nodes: PullRequestSummary[] };
      };
    }>(query, { owner, repo, states });

    return result.repository.pullRequests.nodes;
  }

  async getBranches(owner: string, repo: string): Promise<BranchInfo[]> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          defaultBranchRef {
            name
          }
          refs(refPrefix: "refs/heads/", first: 50, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
            nodes {
              name
              branchProtectionRule {
                id
              }
              target {
                ... on Commit {
                  message
                  committedDate
                  author {
                    name
                    avatarUrl
                    user {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    interface BranchNode {
      name: string;
      branchProtectionRule: { id: string } | null;
      target: {
        message: string;
        committedDate: string;
        author: {
          name: string | null;
          avatarUrl: string;
          user: { login: string } | null;
        } | null;
      } | null;
    }

    const result = await this.graphqlWithAuth<{
      repository: {
        defaultBranchRef: { name: string } | null;
        refs: { nodes: BranchNode[] };
      };
    }>(query, { owner, repo });

    const defaultBranch = result.repository.defaultBranchRef?.name ?? 'main';
    const branches = result.repository.refs.nodes;

    // Fetch ahead/behind counts in parallel via REST compare API
    const comparisons = await Promise.allSettled(
      branches.map(async (branch) => {
        if (branch.name === defaultBranch) {
          return { ahead_by: 0, behind_by: 0 };
        }
        const resp = await this.octokit.request(
          'GET /repos/{owner}/{repo}/compare/{basehead}',
          {
            owner,
            repo,
            basehead: `${defaultBranch}...${branch.name}`,
          }
        );
        return {
          ahead_by: resp.data.ahead_by as number,
          behind_by: resp.data.behind_by as number,
        };
      })
    );

    return branches.map((branch, i) => {
      const cmpResult = comparisons[i];
      const cmp =
        cmpResult.status === 'fulfilled'
          ? cmpResult.value
          : { ahead_by: 0, behind_by: 0 };
      const target = branch.target;
      return {
        name: branch.name,
        isDefault: branch.name === defaultBranch,
        lastCommitMessage: target?.message ?? '',
        lastCommitDate: target?.committedDate ?? '',
        lastCommitAuthor: {
          name: target?.author?.name ?? null,
          login: target?.author?.user?.login ?? null,
          avatarUrl: target?.author?.avatarUrl ?? '',
        },
        aheadBy: cmp.ahead_by,
        behindBy: cmp.behind_by,
        isProtected: branch.branchProtectionRule !== null,
      };
    });
  }

  async getCodeFrequency(
    owner: string,
    repo: string,
    options: {
      since?: string;
      until?: string;
      path?: string;
      maxCommits?: number;
    } = {}
  ): Promise<CodeFrequencyData> {
    const maxCommits = Math.min(options.maxCommits ?? 100, 500);
    const since = options.since;
    const until = options.until;
    const pathFilter = options.path;

    // 1. List commits (paginated)
    const allCommitShas: Array<{ sha: string; date: string; author: { login: string | null; avatarUrl: string; name: string | null }; message: string }> = [];

    let page = 1;
    while (allCommitShas.length < maxCommits) {
      const perPage = Math.min(100, maxCommits - allCommitShas.length);
      const params: {
        owner: string;
        repo: string;
        per_page: number;
        page: number;
        since?: string;
        until?: string;
        path?: string;
      } = { owner, repo, per_page: perPage, page };
      if (since) params.since = since;
      if (until) params.until = until;
      if (pathFilter) params.path = pathFilter;

      const resp = await this.octokit.request('GET /repos/{owner}/{repo}/commits', params);

      if (!resp.data || resp.data.length === 0) break;

      for (const c of resp.data) {
        allCommitShas.push({
          sha: c.sha,
          date: (c.commit.author?.date ?? c.commit.committer?.date ?? '') as string,
          author: {
            login: c.author?.login ?? null,
            avatarUrl: c.author?.avatar_url ?? '',
            name: c.commit.author?.name ?? null,
          },
          message: c.commit.message ?? '',
        });
      }

      if (resp.data.length < perPage) break;
      page++;
    }

    // 2. Fetch commit details in batches of 5
    const commitDetails: Array<{ sha: string; date: string; author: { login: string | null; avatarUrl: string; name: string | null }; message: string; additions: number; deletions: number; files: Array<{ filename: string; additions: number; deletions: number; changes: number; status: string }> }> = [];

    const BATCH = 10;
    for (let i = 0; i < allCommitShas.length; i += BATCH) {
      const batch = allCommitShas.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (c) => {
          const detail = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
            owner,
            repo,
            ref: c.sha,
          });
          return {
            sha: c.sha,
            date: c.date,
            author: c.author,
            message: c.message,
            additions: detail.data.stats?.additions ?? 0,
            deletions: detail.data.stats?.deletions ?? 0,
            files: (detail.data.files ?? []).map((f) => ({
              filename: f.filename ?? '',
              additions: f.additions ?? 0,
              deletions: f.deletions ?? 0,
              changes: f.changes ?? 0,
              status: f.status ?? 'modified',
            })),
          };
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') commitDetails.push(r.value);
      }
    }

    // 3. Aggregate: timeSeries (bucket by ISO week start)
    function getWeekStart(dateStr: string): string {
      const d = new Date(dateStr);
      const day = d.getUTCDay(); // 0=Sun
      const diff = day === 0 ? 0 : day;
      d.setUTCDate(d.getUTCDate() - diff);
      return d.toISOString().slice(0, 10);
    }

    const weekMap = new Map<string, { additions: number; deletions: number; commitCount: number }>();
    for (const c of commitDetails) {
      const week = getWeekStart(c.date);
      const entry = weekMap.get(week) ?? { additions: 0, deletions: 0, commitCount: 0 };
      entry.additions += c.additions;
      entry.deletions += c.deletions;
      entry.commitCount++;
      weekMap.set(week, entry);
    }
    const timeSeries = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({ weekStart, ...v }));

    // 4. directoryBreakdown — recursive tree
    interface DirNode {
      path: string;
      additions: number;
      deletions: number;
      changes: number;
      commitCount: number;
      files: number;
      children: Map<string, DirNode>;
    }

    function makeDirNode(path: string): DirNode {
      return { path, additions: 0, deletions: 0, changes: 0, commitCount: 0, files: 0, children: new Map() };
    }

    const root = makeDirNode('');

    for (const c of commitDetails) {
      const seenDirsThisCommit = new Set<string>();
      for (const f of c.files) {
        const parts = f.filename.split('/');
        // Walk from root down each directory level
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
          const segment = parts.slice(0, i + 1).join('/') + '/';
          if (!node.children.has(segment)) {
            node.children.set(segment, makeDirNode(segment));
          }
          const child = node.children.get(segment)!;
          if (!seenDirsThisCommit.has(segment)) {
            child.commitCount++;
            seenDirsThisCommit.add(segment);
          }
          child.additions += f.additions;
          child.deletions += f.deletions;
          child.changes += f.changes;
          child.files++;
          node = child;
        }
        // Leaf file node
        const filename = f.filename;
        if (!node.children.has(filename)) {
          node.children.set(filename, makeDirNode(filename));
        }
        const fileNode = node.children.get(filename)!;
        fileNode.additions += f.additions;
        fileNode.deletions += f.deletions;
        fileNode.changes += f.changes;
        fileNode.commitCount++;
        fileNode.files = 1;
      }
    }

    function toDirectoryStats(node: DirNode): DirectoryStats {
      return {
        path: node.path,
        additions: node.additions,
        deletions: node.deletions,
        changes: node.changes,
        commitCount: node.commitCount,
        files: node.files,
        children: Array.from(node.children.values()).map(toDirectoryStats),
      };
    }

    const directoryBreakdown = Array.from(root.children.values()).map(toDirectoryStats);

    // 5. topFiles — top 50 by total changes
    const fileMap = new Map<string, { additions: number; deletions: number; changes: number; commitCount: number }>();
    for (const c of commitDetails) {
      for (const f of c.files) {
        const entry = fileMap.get(f.filename) ?? { additions: 0, deletions: 0, changes: 0, commitCount: 0 };
        entry.additions += f.additions;
        entry.deletions += f.deletions;
        entry.changes += f.changes;
        entry.commitCount++;
        fileMap.set(f.filename, entry);
      }
    }
    const topFiles = Array.from(fileMap.entries())
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 50);

    // 6. contributors — group by author login
    const contribMap = new Map<string, { login: string | null; name: string | null; avatarUrl: string; additions: number; deletions: number; commitCount: number }>();
    for (const c of commitDetails) {
      const key = c.author.login ?? c.author.name ?? 'unknown';
      const entry = contribMap.get(key) ?? { login: c.author.login, name: c.author.name, avatarUrl: c.author.avatarUrl, additions: 0, deletions: 0, commitCount: 0 };
      entry.additions += c.additions;
      entry.deletions += c.deletions;
      entry.commitCount++;
      contribMap.set(key, entry);
    }
    const contributors = Array.from(contribMap.values())
      .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));

    const dates = commitDetails.map((c) => c.date).filter(Boolean).sort();

    return {
      timeSeries,
      directoryBreakdown,
      topFiles,
      contributors,
      totalCommitsAnalyzed: commitDetails.length,
      period: {
        since: since ?? dates[0] ?? '',
        until: until ?? dates[dates.length - 1] ?? '',
      },
    };
  }

  async getUserRepos(): Promise<UserRepo[]> {
    const response = await this.octokit.request('GET /user/repos', {
      sort: 'updated',
      per_page: 100,
    });

    return response.data.map((r) => ({
      name: r.name,
      full_name: r.full_name,
      owner: { login: r.owner?.login ?? '' },
      description: r.description ?? null,
      private: r.private,
      stargazers_count: r.stargazers_count ?? 0,
      forks_count: r.forks_count ?? 0,
      default_branch: r.default_branch ?? 'main',
      updated_at: r.updated_at ?? '',
    }));
  }

  async getUserOrgs(): Promise<UserOrg[]> {
    const data = await this.octokit.paginate('GET /user/orgs', { per_page: 100 });
    return data.map((o) => ({
      login: o.login,
      avatar_url: o.avatar_url,
      description: (o as { description?: string | null }).description ?? null,
    }));
  }

  async getOrgRepos(org: string, page: number, perPage: number): Promise<ReposPage> {
    const response = await this.octokit.request('GET /orgs/{org}/repos', {
      org,
      sort: 'updated',
      per_page: perPage,
      page,
    });

    const repos = response.data.map((r) => ({
      name: r.name,
      full_name: r.full_name,
      owner: { login: r.owner?.login ?? '' },
      description: r.description ?? null,
      private: r.private,
      stargazers_count: r.stargazers_count ?? 0,
      forks_count: r.forks_count ?? 0,
      default_branch: r.default_branch ?? 'main',
      updated_at: r.updated_at ?? '',
    }));

    return {
      repos,
      page,
      per_page: perPage,
      has_next_page: response.data.length === perPage,
    };
  }

  async getUserOwnRepos(page: number, perPage: number): Promise<ReposPage> {
    const response = await this.octokit.request('GET /user/repos', {
      type: 'owner',
      sort: 'updated',
      per_page: perPage,
      page,
    });

    const repos = response.data.map((r) => ({
      name: r.name,
      full_name: r.full_name,
      owner: { login: r.owner?.login ?? '' },
      description: r.description ?? null,
      private: r.private,
      stargazers_count: r.stargazers_count ?? 0,
      forks_count: r.forks_count ?? 0,
      default_branch: r.default_branch ?? 'main',
      updated_at: r.updated_at ?? '',
    }));

    return {
      repos,
      page,
      per_page: perPage,
      has_next_page: response.data.length === perPage,
    };
  }
}
