import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDrivingLeads,
  createDrivingLead,
  updateDrivingLead,
  deleteDrivingLead,
  getDrivingPhotos,
  uploadDrivingPhotos,
  deleteDrivingPhoto,
} from '@/lib/api';
import type { DrivingLead, DrivingLeadStatus, DrivingPhoto } from '@/types/property';

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

export function useDrivingPhotos(leadId: string | null) {
  return useQuery<DrivingPhoto[]>({
    queryKey: ['driving-photos', leadId],
    queryFn: () => getDrivingPhotos(leadId!),
    enabled: !!leadId,
  });
}

export function useUploadDrivingPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, photos }: { leadId: string; photos: Array<{ data: string }> }) =>
      uploadDrivingPhotos(leadId, photos),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['driving-photos', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
    },
  });
}

export function useDeleteDrivingPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, photoId }: { leadId: string; photoId: string }) =>
      deleteDrivingPhoto(leadId, photoId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['driving-photos', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
    },
  });
}
