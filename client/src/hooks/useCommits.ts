import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useCommits(
  owner: string,
  repo: string,
  branch: string,
  enabled = true
) {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['commits', owner, repo, branch],
      queryFn: ({ pageParam }) =>
        api.repos.commits(
          owner,
          repo,
          branch,
          typeof pageParam === 'string' ? pageParam : undefined
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) =>
        lastPage.pageInfo.hasNextPage ? (lastPage.pageInfo.endCursor ?? undefined) : undefined,
      enabled: enabled && !!owner && !!repo && !!branch,
      staleTime: 5 * 60 * 1000,
    });

  const allCommits = data?.pages.flatMap((p) => p.nodes) ?? [];

  return {
    commits: allCommits,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}

export function useCommitDetail(
  owner: string,
  repo: string,
  sha: string | null
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['commit', owner, repo, sha],
    queryFn: () => api.repos.commitDetail(owner, repo, sha!),
    enabled: !!sha && !!owner && !!repo,
    staleTime: 10 * 60 * 1000,
  });

  return { commit: data, isLoading, error };
}
