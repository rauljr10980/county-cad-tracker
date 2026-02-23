import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFollowUps, createFollowUp, updateFollowUp, deleteFollowUp } from '@/lib/api';
import type { FollowUp } from '@/types/property';

export function useFollowUps(month: string) {
  return useQuery<FollowUp[]>({
    queryKey: ['followups', month],
    queryFn: () => getFollowUps(month),
    enabled: !!month,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useCreateFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      date: string;
      note?: string;
      propertyId?: string;
      documentNumber?: string;
    }) => createFollowUp(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}

export function useUpdateFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string;
      completed?: boolean;
      note?: string;
      date?: string;
    }) => updateFollowUp(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}

export function useDeleteFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFollowUp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}
