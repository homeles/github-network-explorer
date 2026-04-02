import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useRepos(enabled = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.repos.list(),
    staleTime: 2 * 60 * 1000,
    enabled,
  });

  return {
    repos: data ?? [],
    isLoading,
    error,
    refetch,
  };
}
