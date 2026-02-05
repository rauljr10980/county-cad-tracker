import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPreForeclosures,
  updatePreForeclosure,
  uploadPreForeclosureFile,
  uploadAddressOnlyPreForeclosureFile,
  deletePreForeclosures,
  getPreForeclosureUploadHistory,
  getLatestPreForeclosureUploadStats,
  lookupPreForeclosureOwner
} from '@/lib/api';
import type { PreForeclosureRecord } from '@/types/property';

export function usePreForeclosures() {
  return useQuery<PreForeclosureRecord[], Error, PreForeclosureRecord[]>({
    queryKey: ['preforeclosure'],
    queryFn: getPreForeclosures,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    select: (data) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return data.filter(r => {
        if (!r.sale_date) return true;
        const saleDate = new Date(r.sale_date);
        saleDate.setHours(0, 0, 0, 0);
        return saleDate >= today;
      });
    },
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

export function useUploadAddressOnlyPreForeclosureFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, type }: { file: File; type: 'Mortgage' | 'Tax' }) =>
      uploadAddressOnlyPreForeclosureFile(file, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preforeclosure'] });
    },
  });
}

export function useOwnerLookup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentNumber: string) => lookupPreForeclosureOwner(documentNumber),
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

