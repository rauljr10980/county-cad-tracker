import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFiles, uploadFile, deleteFile, getDashboardStats, getProperties } from '@/lib/api';
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

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: getDashboardStats,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}

export function useProperties(filters?: {
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery<Property[]>({
    queryKey: ['properties', filters],
    queryFn: () => getProperties(filters),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}
