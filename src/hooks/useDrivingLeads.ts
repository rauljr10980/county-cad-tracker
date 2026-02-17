import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDrivingLeads,
  createDrivingLead,
  updateDrivingLead,
  deleteDrivingLead,
} from '@/lib/api';
import type { DrivingLead, DrivingLeadStatus } from '@/types/property';

export function useDrivingLeads() {
  return useQuery<DrivingLead[]>({
    queryKey: ['driving-leads'],
    queryFn: getDrivingLeads,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useCreateDrivingLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { address: string; notes?: string; loggedBy?: string }) =>
      createDrivingLead(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
    },
  });
}

export function useUpdateDrivingLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: DrivingLeadStatus; notes?: string }) =>
      updateDrivingLead(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
    },
  });
}

export function useDeleteDrivingLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDrivingLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
    },
  });
}
