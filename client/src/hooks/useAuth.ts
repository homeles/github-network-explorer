import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useAuth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => api.auth.status(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    isAuthenticated: data?.authenticated ?? false,
    user: data?.user,
    isLoading,
    error,
  };
}
