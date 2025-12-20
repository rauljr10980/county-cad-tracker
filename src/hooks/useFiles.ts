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
    refetchOnMount: true, // Refetch when mounting to get latest data
    refetchOnWindowFocus: false, // Don't auto-refetch to save API calls
    retry: 3, // Retry up to 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff
    staleTime: 30000, // Consider data fresh for 30 seconds
    // gcTime removed - use default caching behavior
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

