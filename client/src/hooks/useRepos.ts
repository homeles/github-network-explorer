import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import type { UserRepo, ReposPage } from '../lib/api.js';

/** @deprecated Use useOrgRepos instead */
export function useRepos(enabled = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.repos.list(),
    staleTime: 2 * 60 * 1000,
    enabled,
  });

  return {
    repos: (data as UserRepo[] | undefined) ?? [],
    isLoading,
    error,
    refetch,
  };
}

export function useOrgs(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.orgs.list(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  return {
    orgs: data ?? [],
    isLoading,
    error,
  };
}

export function useOrgRepos(owner: string | null, userLogin: string | null, enabled = true) {
  const [page, setPage] = useState(1);
  const [accumulatedRepos, setAccumulatedRepos] = useState<UserRepo[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Reset when owner changes
  useEffect(() => {
    setPage(1);
    setAccumulatedRepos([]);
    setHasNextPage(false);
  }, [owner]);

  const isPersonal = owner === null || owner === userLogin;

  const { data, isLoading, error } = useQuery<ReposPage>({
    queryKey: isPersonal ? ['repos-paged', page] : ['org-repos', owner, page],
    queryFn: () =>
      isPersonal
        ? api.repos.listPaged(page, 30)
        : api.orgs.repos(owner!, page, 30),
    staleTime: 2 * 60 * 1000,
    enabled: enabled && (isPersonal || owner !== null),
  });

  useEffect(() => {
    if (!data) return;
    if (page === 1) {
      setAccumulatedRepos(data.repos);
    } else {
      setAccumulatedRepos((prev) => [...prev, ...data.repos]);
    }
    setHasNextPage(data.has_next_page);
  }, [data, page]);

  function loadMore() {
    if (hasNextPage) {
      setPage((p) => p + 1);
    }
  }

  return {
    repos: accumulatedRepos,
    isLoading,
    error,
    hasNextPage,
    loadMore,
    page,
  };
}
