import { useQuery } from '@tanstack/react-query';
import { getInsights, getKpis, getProspects, getSearch, computeKpis } from './api';
import { mockSearch } from './mock';
import type { Prospect, SearchJob } from './types';

function isActive(status: SearchJob['status'] | undefined) {
  return status === 'pending' || status === 'processing';
}

export function useSearchJob(id: string | undefined) {
  const query = useQuery({
    queryKey: ['search', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: () => getSearch(id!),
    refetchInterval: (current) => (isActive(current.state.data?.status) ? 2500 : false),
  });
  const fallback = Boolean(id) && query.isError;
  const search = query.data ?? (fallback && id ? mockSearch(id) : undefined);
  return { query, search, fallback };
}

export function useProspects(id: string | undefined, poll: boolean) {
  const query = useQuery({
    queryKey: ['prospects', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: () => getProspects(id!),
    refetchInterval: poll ? 2500 : false,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? rows.length;
  return { query, rows, total, fallback: query.isError };
}

export function useKpiSet(id: string | undefined, rows: Prospect[] | undefined, poll: boolean) {
  const query = useQuery({
    queryKey: ['kpis', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: () => getKpis(id!),
    refetchInterval: poll ? 2500 : false,
  });
  const kpis = query.data ?? (rows ? computeKpis(rows) : null);
  return { kpis, fromApi: Boolean(query.data) };
}

export function useInsights(id: string | undefined, poll: boolean) {
  return useQuery({
    queryKey: ['insights', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: () => getInsights(id!),
    refetchInterval: poll ? 2500 : false,
  });
}
