import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import type {
  RepoOverview,
  CommitsPage,
  CommitDetail,
  PullRequestSummary,
  UserRepo,
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
                    parents {
                      nodes {
                        oid
                      }
                    }
                    additions
                    deletions
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
              parents {
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
