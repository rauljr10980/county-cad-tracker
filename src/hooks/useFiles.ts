import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getFiles, uploadFile, deleteFile, getLatestComparison, getDashboardStats, getProperties } from '@/lib/api';
import type { UploadedFile, ComparisonReport, DashboardStats, Property } from '@/types/property';

export function useFiles() {
  return useQuery<UploadedFile[]>({
    queryKey: ['files'],
    queryFn: getFiles,
    retry: 3, // Retry failed requests
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't auto-refetch to save API calls
    refetchInterval: (query) => {
      // If any file is processing, refetch every 5 seconds to show progress
      const files = query.state.data || [];
      const hasProcessing = files.some(f => f.status === 'processing');
      return hasProcessing ? 5000 : false;
    },
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: uploadFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useLatestComparison() {
  const queryClient = useQueryClient();
  
  return useQuery<ComparisonReport | null>({
    queryKey: ['comparisons', 'latest'],
    queryFn: async () => {
      console.log('[useLatestComparison] Fetching comparison...');
      
      // Check cache first - if we have valid cached data, use it
      const cached = queryClient.getQueryData<ComparisonReport | null>(['comparisons', 'latest']);
      if (cached && cached.summary && cached.currentFile) {
        console.log('[useLatestComparison] Using cached data:', {
          currentFile: cached.currentFile,
          hasSummary: !!cached.summary,
        });
        // Still try to fetch fresh data in background, but return cached immediately
        getLatestComparison().then((freshData) => {
          if (freshData) {
            console.log('[useLatestComparison] Fresh data fetched, updating cache');
            queryClient.setQueryData(['comparisons', 'latest'], freshData);
          }
        }).catch(() => {
          // Ignore errors - keep cached data
        });
        return cached;
      }
      
      try {
        const data = await getLatestComparison();
        console.log('[useLatestComparison] Fetch result:', {
          hasData: !!data,
          hasSummary: !!data?.summary,
          currentFile: data?.currentFile,
          previousFile: data?.previousFile,
        });
        // If we get null but have cached data, don't overwrite it
        if (!data && cached) {
          console.log('[useLatestComparison] Got null but have cached data, keeping cache');
          return cached;
        }
        return data;
      } catch (error) {
        console.error('[useLatestComparison] Fetch error:', error);
        // On error, try to keep cached data
        if (cached) {
          console.log('[useLatestComparison] Error but have cached data, returning cache');
          return cached;
        }
        throw error;
      }
    },
    refetchOnMount: false, // Don't refetch on mount if we have data - prevents clearing
    refetchOnWindowFocus: false, // Don't refetch on focus if we have data - prevents clearing
    // Auto-refetch every 5 seconds when no data (to catch auto-generated comparisons)
    refetchInterval: (query) => {
      // Only refetch if we don't have data (don't refetch if we already have data)
      const shouldRefetch = !query.state.data;
      console.log('[useLatestComparison] Refetch interval check:', { hasData: !!query.state.data, shouldRefetch });
      return shouldRefetch ? 5000 : false;
    },
    // Keep previous data when refetching to prevent flickering
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => {
      // Don't retry on 404 (no comparison available) - but the backend will auto-generate
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = String(error.message);
        if (errorMsg.includes('404') || errorMsg.includes('No comparisons found')) {
          // Retry multiple times to allow backend to generate comparison
          return failureCount < 3;
        }
      }
      return false;
    },
    retryDelay: 2000, // Wait 2 seconds before retry to allow backend generation
    // Don't clear data on error - keep existing data if available
    onError: (error) => {
      console.error('[useLatestComparison] Query error:', error);
      // Keep existing data even on error
    },
    onSuccess: (data) => {
      console.log('[useLatestComparison] Query success:', {
        hasData: !!data,
        hasSummary: !!data?.summary,
        currentFile: data?.currentFile,
      });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: getDashboardStats,
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Don't auto-refetch to save API calls
  });
}

export interface PropertiesResponse {
  properties: Property[];
  total: number;
  totalUnfiltered?: number;
  statusCounts?: { J: number; A: number; P: number; other: number };
  page: number;
  totalPages: number;
  filter?: string | null;
}

export function useProperties(page = 1, limit = 100, status?: string, search?: string) {
  return useQuery<PropertiesResponse>({
    queryKey: ['properties', page, limit, status, search],
    queryFn: async () => {
      try {
        const result = await getProperties(page, limit, status, search);
        console.log('[useProperties] API response:', result);
        // Ensure we always return the expected format
        if (Array.isArray(result)) {
          return { properties: result, total: result.length, page: 1, totalPages: 1 };
        }
        return result;
      } catch (error) {
        console.error('[useProperties] Error:', error);
        throw error;
      }
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

