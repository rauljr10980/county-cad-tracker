import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';

async function fetchTotal(url: string): Promise<number> {
  const res = await fetch(url, { headers: getAuthHeaders() });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body.total ?? 0;
}

/** Total eviction-lead count, for the Dashboard KPI row. Reuses the same
 *  `/api/evictions/landlords` endpoint EvictionLeadsView.tsx lists from,
 *  requesting a single row purely to read the response's `total` field. */
export function useEvictionLeadsCount() {
  return useQuery<number>({
    queryKey: ['eviction-leads-count'],
    queryFn: () => fetchTotal(`${API_BASE_URL}/api/evictions/landlords?page=1&pageSize=1`),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

/** Total MLS-lead count, for the Dashboard KPI row. Same approach as
 *  useEvictionLeadsCount, against MlsLeadsView.tsx's `/api/mls-leads` list. */
export function useMlsLeadsCount() {
  return useQuery<number>({
    queryKey: ['mls-leads-count'],
    queryFn: () => fetchTotal(`${API_BASE_URL}/api/mls-leads/?page=1&pageSize=1`),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}
