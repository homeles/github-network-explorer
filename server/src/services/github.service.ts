import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import type {
  RepoOverview,
  CommitsPage,
  CommitDetail,
  PullRequestSummary,
  UserRepo,
  BranchInfo,
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
}
