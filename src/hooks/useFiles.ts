import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  return useQuery<ComparisonReport | null>({
    queryKey: ['comparisons', 'latest'],
    queryFn: getLatestComparison,
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Refetch when window gains focus to catch new comparisons
    // Auto-refetch every 3 seconds when no data (to catch auto-generated comparisons quickly)
    refetchInterval: (query) => {
      // Aggressively refetch if we don't have data (to catch auto-generated comparisons)
      return !query.state.data ? 3000 : false;
    },
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

