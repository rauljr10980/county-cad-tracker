import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadForeclosureFile } from '../lib/api';

export function useUploadForeclosureFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, mode }: { file: File; mode: 'standard' | 'address-only' }) =>
      uploadForeclosureFile(file, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foreclosures'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}