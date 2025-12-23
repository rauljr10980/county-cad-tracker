import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPreForeclosures, updatePreForeclosure, uploadPreForeclosureFile } from '@/lib/api';
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

