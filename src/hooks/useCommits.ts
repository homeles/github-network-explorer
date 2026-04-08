import { useMemo, useEffect } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/github-api.js';
import type { CommitNode } from '../lib/github-api.js';

export function useCommits(branch: string, enabled = true) {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['commits', branch],
      queryFn: ({ pageParam }) =>
        api.repos.commits(branch, typeof pageParam === 'string' ? pageParam : undefined),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) =>
        lastPage.pageInfo.hasNextPage ? (lastPage.pageInfo.endCursor ?? undefined) : undefined,
      enabled: enabled && !!branch,
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

/**
 * Fetches commits for multiple branches in parallel, deduplicates by OID,
 * and returns a merged list sorted newest-first alongside a branchMap.
 */
export function useMultiBranchCommits(
  branches: string[],
  enabled = true,
  autoFetchAll = false
) {
  const branchesKey = useMemo(() => branches.slice().sort().join('\x00'), [branches]);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['multi-commits', branchesKey],
      queryFn: async ({ pageParam }: { pageParam: Record<string, string | undefined> }) => {
        const BATCH_SIZE = 3;
        const results: Awaited<ReturnType<typeof api.repos.commits>>[] = [];
        for (let i = 0; i < branches.length; i += BATCH_SIZE) {
          const batch = branches.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map((branch) =>
              api.repos.commits(branch, pageParam[branch])
            )
          );
          results.push(...batchResults);
        }
        return { results, branches: [...branches] };
      },
      initialPageParam: {} as Record<string, string | undefined>,
      getNextPageParam: (lastPage): Record<string, string | undefined> | undefined => {
        const nextCursors: Record<string, string | undefined> = {};
        let hasMore = false;
        lastPage.results.forEach((result, i) => {
          const branch = lastPage.branches[i];
          if (branch && result.pageInfo.hasNextPage && result.pageInfo.endCursor) {
            nextCursors[branch] = result.pageInfo.endCursor;
            hasMore = true;
          }
        });
        return hasMore ? nextCursors : undefined;
      },
      enabled: enabled && branches.length > 0,
      staleTime: 5 * 60 * 1000,
    });

  useEffect(() => {
    if (autoFetchAll && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [autoFetchAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { commits, branchMap } = useMemo(() => {
    const commitMap = new Map<string, CommitNode>();
    const bMap = new Map<string, string[]>();

    for (const page of data?.pages ?? []) {
      page.results.forEach((result, i) => {
        const branch = page.branches[i];
        if (!branch) return;
        for (const commit of result.nodes) {
          if (!commitMap.has(commit.oid)) commitMap.set(commit.oid, commit);
          const existing = bMap.get(commit.oid) ?? [];
          if (!existing.includes(branch)) existing.push(branch);
          bMap.set(commit.oid, existing);
        }
      });
    }

    const sorted = Array.from(commitMap.values()).sort(
      (a, b) => new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime()
    );

    return { commits: sorted, branchMap: bMap };
  }, [data]);

  return {
    commits,
    branchMap,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}

export function useCommitDetail(sha: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['commit', sha],
    queryFn: () => api.repos.commitDetail(sha!),
    enabled: !!sha,
    staleTime: 10 * 60 * 1000,
  });

  return { commit: data, isLoading, error };
}
