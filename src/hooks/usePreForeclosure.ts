import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPreForeclosures,
  updatePreForeclosure,
  uploadPreForeclosureFile,
  deletePreForeclosures,
  getPreForeclosureUploadHistory,
  getLatestPreForeclosureUploadStats
} from '@/lib/api';
import type { PreForeclosureRecord } from '@/types/property';

export function usePreForeclosures() {
  return useQuery<PreForeclosureRecord[]>({
    queryKey: ['preforeclosure'],
    queryFn: getPreForeclosures,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}

export function usePreForeclosureUploadHistory(limit: number = 10) {
  return useQuery({
    queryKey: ['preforeclosure-upload-history', limit],
    queryFn: () => getPreForeclosureUploadHistory(limit),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useLatestPreForeclosureUploadStats() {
  return useQuery({
    queryKey: ['preforeclosure-upload-stats-latest'],
    queryFn: getLatestPreForeclosureUploadStats,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useUpdatePreForeclosure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePreForeclosure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    },
  });
}

export function useUploadPreForeclosureFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadPreForeclosureFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    },
  });
}

export function useDeletePreForeclosures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePreForeclosures,
    onSuccess: () => {
      queryClient.setQueryData(['preforeclosure'], []);
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    },
  });
}

