import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFiles, uploadFile, deleteFile, reprocessFile, getDashboardStats, getProperties } from '@/lib/api';
import type { UploadedFile, DashboardStats, Property } from '@/types/property';

export function useFiles() {
  return useQuery<UploadedFile[]>({
    queryKey: ['files'],
    queryFn: getFiles,
    retry: 3, // Retry failed requests
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't auto-refetch to save API calls
    refetchInterval: false, // Disable auto-refetch interval
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();

  
  return useMutation({
    mutationFn: uploadFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useReprocessFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reprocessFile,
    onSuccess: () => {
      // Immediately invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      
      // Refetch files to show updated status
      queryClient.refetchQueries({ queryKey: ['files'] });
    },
    onError: (error) => {
      console.error('[REPROCESS] Error:', error);
    },
  });
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: getDashboardStats,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}

export interface PropertiesResponse {
  properties: Property[];
  total: number;
  totalUnfiltered: number;
  totalPages: number;
  page: number;
  statusCounts: {
    J?: number;
    A?: number;
    P?: number;
    U?: number;
    JUDGMENT?: number;
    ACTIVE?: number;
    PENDING?: number;
    UNKNOWN?: number;
    PAID?: number;
    REMOVED?: number;
    other?: number;
    [key: string]: number | undefined;
  };
  workflowStageCounts?: Record<string, number>;
}

export function useProperties(filters?: import('../lib/api').PropertyFilters) {
  return useQuery<PropertiesResponse>({
    queryKey: ['properties', filters],
    queryFn: () => getProperties(filters || {}),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}
