import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFiles, uploadFile, deleteFile, reprocessFile, getLatestComparison, getDashboardStats } from '@/lib/api';
import type { UploadedFile, ComparisonReport, DashboardStats } from '@/types/property';

export function useFiles() {
  return useQuery<UploadedFile[]>({
    queryKey: ['files'],
    queryFn: getFiles,
    retry: 3, // Retry failed requests
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't auto-refetch to save API calls
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadFile,
    onSuccess: () => {
      // Invalidate immediately
      queryClient.invalidateQueries({ queryKey: ['files'] });

      // Delay comparison and dashboard refetch to allow backend processing
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['comparisons'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 2000); // 2 second delay
    },
  });
}

export function useLatestComparison() {
  return useQuery<ComparisonReport | null>({
    queryKey: ['comparisons', 'latest'],
    queryFn: getLatestComparison,
    refetchOnMount: 'always', // Always refetch, even if data exists
    refetchOnWindowFocus: false, // Don't auto-refetch to save API calls
    retry: 3, // Retry up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff: 1s, 2s, 4s
    staleTime: 0, // Always consider data stale to refetch on mount
    gcTime: 0, // Don't cache - always fresh fetch (previously cacheTime in v4)
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

export function useReprocessFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reprocessFile,
    onSuccess: () => {
      // Invalidate immediately
      queryClient.invalidateQueries({ queryKey: ['files'] });

      // Delay comparison and dashboard refetch to allow backend processing
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['comparisons'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 2000); // 2 second delay
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

