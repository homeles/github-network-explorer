import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { UserOrg, UserRepo } from '../lib/api.js';

export function useOrgs(enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.orgs.list(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  return {
    orgs: (data ?? []) as UserOrg[],
    isLoading,
  };
}

export function useOrgRepos(owner: string | null, userLogin: string | null, enabled = true) {
  const isPersonal = !owner || owner === userLogin;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: isPersonal ? ['repos', 'own'] : ['repos', 'org', owner],
    queryFn: ({ pageParam }) => {
      const page = pageParam as number;
      return isPersonal
        ? api.repos.list(page, 30)
        : api.orgs.repos(owner!, page, 30);
    },
    getNextPageParam: (lastPage) =>
      lastPage.has_next_page ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 2 * 60 * 1000,
    enabled: enabled && !!userLogin,
  });

  const repos: UserRepo[] = data?.pages.flatMap((p) => p.repos) ?? [];

  return {
    repos,
    isLoading,
    hasNextPage: hasNextPage ?? false,
    loadMore: () => void fetchNextPage(),
    isLoadingMore: isFetchingNextPage,
  };
}

/** @deprecated Use useOrgRepos instead */
export function useRepos(enabled = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['repos-legacy'],
    queryFn: () => api.repos.list(1, 100),
    staleTime: 2 * 60 * 1000,
    enabled,
  });

  return {
    repos: data?.repos ?? [],
    isLoading,
    error,
    refetch,
  };
}
