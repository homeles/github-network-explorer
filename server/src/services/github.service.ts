import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import type {
  RepoOverview,
  CommitsPage,
  CommitDetail,
  PullRequestSummary,
  TagInfo,
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
    // First query: repo metadata + first page of branches/tags
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
            pageInfo {
              hasNextPage
              endCursor
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
        branches: {
          nodes: { name: string }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
        tags: { nodes: { name: string }[] };
        stargazerCount: number;
        forkCount: number;
        watchers: { totalCount: number };
        description: string | null;
        isPrivate: boolean;
      };
    }>(query, { owner, repo });

    const r = result.repository;
    const allBranches = [...r.branches.nodes];

    // Paginate remaining branches if any
    let pageInfo = r.branches.pageInfo;
    while (pageInfo.hasNextPage && pageInfo.endCursor) {
      const pageQuery = `
        query($owner: String!, $repo: String!, $cursor: String!) {
          repository(owner: $owner, name: $repo) {
            refs(refPrefix: "refs/heads/", first: 100, after: $cursor) {
              nodes {
                name
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;
      const pageResult = await this.graphqlWithAuth<{
        repository: {
          refs: {
            nodes: { name: string }[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        };
      }>(pageQuery, { owner, repo, cursor: pageInfo.endCursor });

      allBranches.push(...pageResult.repository.refs.nodes);
      pageInfo = pageResult.repository.refs.pageInfo;
    }

    return {
      defaultBranchRef: r.defaultBranchRef,
      branches: allBranches,
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
    cursor?: string,
    since?: string,
    until?: string
  ): Promise<CommitsPage> {
    const query = `
      query($owner: String!, $repo: String!, $branch: String!, $cursor: String, $since: GitTimestamp, $until: GitTimestamp) {
        repository(owner: $owner, name: $repo) {
          ref(qualifiedName: $branch) {
            target {
              ... on Commit {
                history(first: 50, after: $cursor, since: $since, until: $until) {
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
    }>(query, { owner, repo, branch, cursor: cursor ?? null, since: since ?? null, until: until ?? null });

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
    const upper = state?.toUpperCase();
    const states = upper === 'ALL' ? ['OPEN', 'CLOSED', 'MERGED'] : upper ? [upper] : ['OPEN'];
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
              commits(last: 1) {
                totalCount
                nodes {
                  commit {
                    statusCheckRollup {
                      state
                      contexts(first: 25) {
                        nodes {
                          ... on CheckRun {
                            name
                            conclusion
                            status
                            detailsUrl
                          }
                          ... on StatusContext {
                            context
                            state
                            targetUrl
                          }
                        }
                      }
                    }
                  }
                }
              }
              reviews(first: 20) {
                totalCount
                nodes {
                  author {
                    login
                    avatarUrl
                  }
                  state
                }
              }
              reviewRequests(first: 10) {
                nodes {
                  requestedReviewer {
                    ... on User {
                      login
                      avatarUrl
                    }
                    ... on Team {
                      name
                      avatarUrl
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    interface RawPR {
      number: number;
      title: string;
      state: string;
      url: string;
      createdAt: string;
      updatedAt: string;
      author: { login: string; avatarUrl: string } | null;
      headRefName: string;
      baseRefName: string;
      commits: {
        totalCount: number;
        nodes: Array<{
          commit: {
            statusCheckRollup: {
              state: string;
              contexts: {
                nodes: Array<
                  | { name: string; conclusion: string | null; status: string; detailsUrl: string | null }
                  | { context: string; state: string; targetUrl: string | null }
                >;
              };
            } | null;
          };
        }>;
      };
      reviews: {
        totalCount: number;
        nodes: Array<{
          author: { login: string; avatarUrl: string } | null;
          state: string;
        }>;
      };
      reviewRequests: {
        nodes: Array<{
          requestedReviewer:
            | { login: string; avatarUrl: string }
            | { name: string; avatarUrl: string }
            | null;
        }>;
      };
    }

    const result = await this.graphqlWithAuth<{
      repository: {
        pullRequests: { nodes: RawPR[] };
      };
    }>(query, { owner, repo, states });

    return result.repository.pullRequests.nodes.map((pr) => {
      const lastCommitNode = pr.commits.nodes[0];
      const rollup = lastCommitNode?.commit.statusCheckRollup ?? null;

      const reviewRequests = pr.reviewRequests.nodes
        .map((rr) => {
          const rv = rr.requestedReviewer;
          if (!rv) return null;
          if ('login' in rv) return { login: rv.login, avatarUrl: rv.avatarUrl };
          if ('name' in rv) return { login: rv.name, avatarUrl: rv.avatarUrl };
          return null;
        })
        .filter((r): r is { login: string; avatarUrl: string } => r !== null);

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.url,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        author: pr.author,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        commits: { totalCount: pr.commits.totalCount },
        reviews: { totalCount: pr.reviews.totalCount },
        statusCheckRollup: rollup,
        reviewRequests,
        reviewList: pr.reviews.nodes.map((r) => ({
          author: r.author,
          state: r.state,
        })),
      };
    });
  }

  async getTags(owner: string, repo: string): Promise<TagInfo[]> {
    const query = `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          refs(refPrefix: "refs/tags/", first: 50, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }, after: $cursor) {
            nodes {
              name
              target {
                ... on Tag {
                  message
                  tagger { name date }
                  target {
                    ... on Commit {
                      oid
                      abbreviatedOid
                      committedDate
                      message
                      author { name avatarUrl user { login } }
                    }
                  }
                }
                ... on Commit {
                  oid
                  abbreviatedOid
                  committedDate
                  message
                  author { name avatarUrl user { login } }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `;

    interface TagNode {
      name: string;
      target:
        | {
            message?: string;
            tagger?: { name: string; date: string } | null;
            target?: {
              oid: string;
              abbreviatedOid: string;
              committedDate: string;
              message: string;
              author: { name: string | null; avatarUrl: string; user: { login: string } | null } | null;
            } | null;
            // lightweight tag falls through as Commit
            oid?: string;
            abbreviatedOid?: string;
            committedDate?: string;
            author?: { name: string | null; avatarUrl: string; user: { login: string } | null } | null;
          }
        | null;
    }

    const result = await this.graphqlWithAuth<{
      repository: {
        refs: {
          nodes: TagNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    }>(query, { owner, repo, cursor: null });

    return result.repository.refs.nodes.map((node) => {
      const t = node.target;
      if (!t) {
        return {
          name: node.name,
          message: null,
          taggerName: null,
          taggerDate: null,
          commitOid: '',
          commitAbbreviatedOid: '',
          committedDate: '',
          commitMessage: '',
          author: { name: null, avatarUrl: '', login: null },
        };
      }

      // Annotated tag: has tagger + nested target commit
      if ('tagger' in t && t.tagger !== undefined) {
        const commit = t.target;
        return {
          name: node.name,
          message: t.message ?? null,
          taggerName: t.tagger?.name ?? null,
          taggerDate: t.tagger?.date ?? null,
          commitOid: commit?.oid ?? '',
          commitAbbreviatedOid: commit?.abbreviatedOid ?? '',
          committedDate: commit?.committedDate ?? '',
          commitMessage: commit?.message ?? '',
          author: {
            name: commit?.author?.name ?? null,
            avatarUrl: commit?.author?.avatarUrl ?? '',
            login: commit?.author?.user?.login ?? null,
          },
        };
      }

      // Lightweight tag: target IS the commit
      return {
        name: node.name,
        message: null,
        taggerName: null,
        taggerDate: null,
        commitOid: t.oid ?? '',
        commitAbbreviatedOid: t.abbreviatedOid ?? '',
        committedDate: t.committedDate ?? '',
        commitMessage: t.message ?? '',
        author: {
          name: t.author?.name ?? null,
          avatarUrl: t.author?.avatarUrl ?? '',
          login: t.author?.user?.login ?? null,
        },
      };
    });
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

  private buildCodeFrequencyData(
    commitDetails: Array<{
      sha: string; date: string;
      author: { login: string | null; avatarUrl: string; name: string | null };
      message: string; additions: number; deletions: number;
      files: Array<{ filename: string; additions: number; deletions: number; changes: number; status: string }>;
    }>,
    period: { since?: string; until?: string },
    allCommits?: Array<{ sha: string; date: string; author: { login: string | null; avatarUrl: string; name: string | null }; message: string }>,
    tzOffsetMinutes?: number
  ): CodeFrequencyData {
    function getDay(dateStr: string): string {
      // Bucket by the viewer's local date.
      // tzOffsetMinutes is the client's getTimezoneOffset() (e.g. 360 for CST/UTC-6).
      // We subtract it from UTC to get the viewer's local date.
      if (tzOffsetMinutes !== undefined) {
        const utc = new Date(dateStr).getTime();
        const local = new Date(utc - tzOffsetMinutes * 60000);
        return local.toISOString().slice(0, 10);
      }
      // Fallback: use author's local date from the ISO string
      return dateStr.slice(0, 10);
    }

    // Determine the date range bounds (YYYY-MM-DD) for filtering.
    // Both the GitHub API and our bucketing use committer date, so these
    // should be consistent. The inRange filter catches edge cases from
    // timezone bucketing differences.
    const sinceDateBound = period.since ? getDay(period.since) : undefined;
    const untilDateBound = period.until ? getDay(period.until) : undefined;

    function inRange(day: string): boolean {
      if (sinceDateBound && day < sinceDateBound) return false;
      if (untilDateBound && day > untilDateBound) return false;
      return true;
    }

    // Pre-filter commits to only those whose committer date falls in range.
    // This keeps all downstream aggregation (dirs, files, contributors) consistent.
    const filteredCommitDetails = commitDetails.filter(c => inRange(getDay(c.date)));
    const filteredAllCommits = (allCommits ?? commitDetails).filter(c => inRange(getDay(c.date)));

    // Build commit counts from ALL listed commits (not just successfully analyzed ones)
    const dayCommitCounts = new Map<string, number>();
    for (const c of filteredAllCommits) {
      const day = getDay(c.date);
      dayCommitCounts.set(day, (dayCommitCounts.get(day) ?? 0) + 1);
    }

    // Build stats from analyzed commits (may be incomplete due to API failures)
    const dayMap = new Map<string, { additions: number; deletions: number; commitCount: number }>();
    for (const c of filteredCommitDetails) {
      const day = getDay(c.date);
      const entry = dayMap.get(day) ?? { additions: 0, deletions: 0, commitCount: 0 };
      entry.additions += c.additions;
      entry.deletions += c.deletions;
      entry.commitCount++;
      dayMap.set(day, entry);
    }

    // Merge: use listing commit counts, analyzed stats
    const allDays = new Set([...dayCommitCounts.keys(), ...dayMap.keys()]);
    const mergedDayMap = new Map<string, { additions: number; deletions: number; commitCount: number }>();
    for (const day of allDays) {
      const stats = dayMap.get(day) ?? { additions: 0, deletions: 0, commitCount: 0 };
      mergedDayMap.set(day, {
        additions: stats.additions,
        deletions: stats.deletions,
        commitCount: dayCommitCounts.get(day) ?? stats.commitCount,
      });
    }
    const timeSeries = Array.from(mergedDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    interface DirNode {
      path: string; additions: number; deletions: number; changes: number;
      commitCount: number; files: number; children: Map<string, DirNode>;
    }
    function makeDirNode(path: string): DirNode {
      return { path, additions: 0, deletions: 0, changes: 0, commitCount: 0, files: 0, children: new Map() };
    }

    const root = makeDirNode('');
    for (const c of filteredCommitDetails) {
      const seenDirsThisCommit = new Set<string>();
      for (const f of c.files) {
        const parts = f.filename.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
          const segment = parts.slice(0, i + 1).join('/') + '/';
          if (!node.children.has(segment)) node.children.set(segment, makeDirNode(segment));
          const child = node.children.get(segment)!;
          if (!seenDirsThisCommit.has(segment)) { child.commitCount++; seenDirsThisCommit.add(segment); }
          child.additions += f.additions; child.deletions += f.deletions;
          child.changes += f.changes; child.files++;
          node = child;
        }
        const filename = f.filename;
        if (!node.children.has(filename)) node.children.set(filename, makeDirNode(filename));
        const fileNode = node.children.get(filename)!;
        fileNode.additions += f.additions; fileNode.deletions += f.deletions;
        fileNode.changes += f.changes; fileNode.commitCount++; fileNode.files = 1;
      }
    }
    function toDirectoryStats(node: DirNode): DirectoryStats {
      return {
        path: node.path, additions: node.additions, deletions: node.deletions,
        changes: node.changes, commitCount: node.commitCount, files: node.files,
        children: Array.from(node.children.values()).map(toDirectoryStats),
      };
    }
    const directoryBreakdown = Array.from(root.children.values()).map(toDirectoryStats);

    const fileMap = new Map<string, { additions: number; deletions: number; changes: number; commitCount: number }>();
    for (const c of filteredCommitDetails) {
      for (const f of c.files) {
        const entry = fileMap.get(f.filename) ?? { additions: 0, deletions: 0, changes: 0, commitCount: 0 };
        entry.additions += f.additions; entry.deletions += f.deletions;
        entry.changes += f.changes; entry.commitCount++;
        fileMap.set(f.filename, entry);
      }
    }
    const topFiles = Array.from(fileMap.entries())
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 50);

    const contribMap = new Map<string, { login: string | null; name: string | null; avatarUrl: string; additions: number; deletions: number; commitCount: number }>();
    for (const c of filteredCommitDetails) {
      const key = c.author.login ?? c.author.name ?? 'unknown';
      const entry = contribMap.get(key) ?? { login: c.author.login, name: c.author.name, avatarUrl: c.author.avatarUrl, additions: 0, deletions: 0, commitCount: 0 };
      entry.additions += c.additions; entry.deletions += c.deletions; entry.commitCount++;
      contribMap.set(key, entry);
    }
    const contributors = Array.from(contribMap.values())
      .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));

    const allDates = filteredAllCommits.map((c) => c.date).filter(Boolean).sort();
    return {
      timeSeries, directoryBreakdown, topFiles, contributors,
      totalCommitsAnalyzed: filteredAllCommits.length,
      period: { since: period.since ?? allDates[0] ?? '', until: period.until ?? allDates[allDates.length - 1] ?? '' },
    };
  }

  async getCodeFrequency(
    owner: string,
    repo: string,
    options: { since?: string; until?: string; path?: string; maxCommits?: number; tzOffset?: number } = {}
  ): Promise<CodeFrequencyData> {
    return this.getCodeFrequencyWithProgress(owner, repo, options, () => {});
  }

  async getCodeFrequencyWithProgress(
    owner: string,
    repo: string,
    options: { since?: string; until?: string; path?: string; maxCommits?: number; tzOffset?: number },
    onProgress: (event: {
      phase: 'listing' | 'analyzing';
      loaded: number;
      total: number | null;
      partialData?: CodeFrequencyData;
    }) => void,
    signal?: AbortSignal
  ): Promise<CodeFrequencyData> {
    const maxCommits = options.maxCommits ?? Infinity;
    const since = options.since;
    const until = options.until;
    const pathFilter = options.path;

    // 1. List commits (paginated)
    type CommitBasic = { sha: string; date: string; author: { login: string | null; avatarUrl: string; name: string | null }; message: string };
    const allCommitShas: CommitBasic[] = [];

    let page = 1;
    while (maxCommits === Infinity || allCommitShas.length < maxCommits) {
      if (signal?.aborted) break;
      const perPage = maxCommits === Infinity ? 100 : Math.min(100, maxCommits - allCommitShas.length);
      const params: { owner: string; repo: string; per_page: number; page: number; since?: string; until?: string; path?: string } =
        { owner, repo, per_page: perPage, page };
      if (since) params.since = since;
      if (until) params.until = until;
      if (pathFilter) params.path = pathFilter;

      const resp = await this.octokit.request('GET /repos/{owner}/{repo}/commits', params);
      if (!resp.data || resp.data.length === 0) break;

      for (const c of resp.data) {
        allCommitShas.push({
          sha: c.sha,
          date: (c.commit.committer?.date ?? c.commit.author?.date ?? '') as string,
          author: { login: c.author?.login ?? null, avatarUrl: c.author?.avatar_url ?? '', name: c.commit.author?.name ?? null },
          message: c.commit.message ?? '',
        });
      }

      onProgress({ phase: 'listing', loaded: allCommitShas.length, total: null });
      if (resp.data.length < perPage) break;
      page++;
    }

    // 2. Fetch commit details in batches of 10
    type CommitDetailItem = {
      sha: string; date: string; author: { login: string | null; avatarUrl: string; name: string | null };
      message: string; additions: number; deletions: number;
      files: Array<{ filename: string; additions: number; deletions: number; changes: number; status: string }>;
    };
    const commitDetails: CommitDetailItem[] = [];
    const BATCH = 10;
    const PROGRESS_EVERY = 50;
    const PARTIAL_EVERY = 500;
    let lastReportAt = 0;
    let lastPartialAt = 0;

    const fetchWithRetry = async (c: CommitBasic, retries = 2): Promise<CommitDetailItem> => {
      try {
        const detail = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', { owner, repo, ref: c.sha });
        return {
          sha: c.sha, date: c.date, author: c.author, message: c.message,
          additions: detail.data.stats?.additions ?? 0,
          deletions: detail.data.stats?.deletions ?? 0,
          files: (detail.data.files ?? []).map((f) => ({
            filename: f.filename ?? '', additions: f.additions ?? 0,
            deletions: f.deletions ?? 0, changes: f.changes ?? 0, status: f.status ?? 'modified',
          })),
        };
      } catch (err) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 1000));
          return fetchWithRetry(c, retries - 1);
        }
        // On final failure, return the commit with zero stats so it's still counted
        return {
          sha: c.sha, date: c.date, author: c.author, message: c.message,
          additions: 0, deletions: 0, files: [],
        };
      }
    };

    for (let i = 0; i < allCommitShas.length; i += BATCH) {
      if (signal?.aborted) break;
      const batch = allCommitShas.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(c => fetchWithRetry(c)));
      for (const r of results) {
        // fetchWithRetry always resolves (returns zero-stat fallback on failure)
        if (r.status === 'fulfilled') commitDetails.push(r.value);
      }

      const isLast = i + BATCH >= allCommitShas.length;
      if (commitDetails.length - lastReportAt >= PROGRESS_EVERY || isLast) {
        const includePartial = commitDetails.length - lastPartialAt >= PARTIAL_EVERY || isLast;
        onProgress({
          phase: 'analyzing',
          loaded: commitDetails.length,
          total: allCommitShas.length,
          partialData: includePartial ? this.buildCodeFrequencyData(commitDetails, options, allCommitShas, options.tzOffset) : undefined,
        });
        lastReportAt = commitDetails.length;
        if (includePartial) lastPartialAt = commitDetails.length;
      }
    }

    return this.buildCodeFrequencyData(commitDetails, options, allCommitShas, options.tzOffset);
  }

  async getRateLimit(): Promise<{ limit: number; remaining: number; used: number; reset: number }> {
    const resp = await this.octokit.request('GET /rate_limit');
    const core = resp.data.rate;
    return { limit: core.limit, remaining: core.remaining, used: core.used, reset: core.reset };
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
