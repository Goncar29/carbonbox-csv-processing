import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import {
  CreatedUpload,
  isFinalStatus,
  PaginatedUploads,
  Upload,
  UploadResults,
  UploadsSummary,
} from '../types/upload.types';

export const POLLING_INTERVAL_MS = 3_000;
export const PAGE_SIZE = 10;

/** Query keys in one place so invalidation stays consistent. */
export const uploadKeys = {
  all: ['uploads'] as const,
  summary: () => [...uploadKeys.all, 'summary'] as const,
  list: (page: number) => [...uploadKeys.all, 'list', page] as const,
  detail: (id: string) => [...uploadKeys.all, 'detail', id] as const,
  results: (id: string) => [...uploadKeys.all, 'results', id] as const,
};

const uploadsApi = {
  getSummary: async () => (await apiClient.get<UploadsSummary>('/uploads/summary')).data,
  list: async (page: number) =>
    (await apiClient.get<PaginatedUploads>('/uploads', { params: { page, limit: PAGE_SIZE } })).data,
  getById: async (id: string) => (await apiClient.get<Upload>(`/uploads/${id}`)).data,
  getResults: async (id: string) => (await apiClient.get<UploadResults>(`/uploads/${id}/results`)).data,
  create: async (file: File, onProgress: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<CreatedUpload>('/uploads', formData, {
      onUploadProgress: (event) => {
        if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
    return response.data;
  },
};

export function useUploadsSummary() {
  return useQuery({ queryKey: uploadKeys.summary(), queryFn: uploadsApi.getSummary });
}

export function useUploads(page: number) {
  return useQuery({
    queryKey: uploadKeys.list(page),
    queryFn: () => uploadsApi.list(page),
    // Keeps the current page visible while the next one loads.
    placeholderData: (previous) => previous,
  });
}

/**
 * Polls every 3s while the upload is not in a final status (PENDING or PROCESSING),
 * so the page also follows an upload the worker has not picked up yet.
 */
export function useUpload(id: string) {
  return useQuery({
    queryKey: uploadKeys.detail(id),
    queryFn: () => uploadsApi.getById(id),
    refetchInterval: (query) => (isFinalStatus(query.state.data?.status) ? false : POLLING_INTERVAL_MS),
  });
}

/** Results only exist once processing finished, so the query waits for that. */
export function useUploadResults(id: string, enabled: boolean) {
  return useQuery({
    queryKey: uploadKeys.results(id),
    queryFn: () => uploadsApi.getResults(id),
    enabled,
  });
}

export function useCreateUpload(onProgress: (percent: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadsApi.create(file, onProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: uploadKeys.all }),
  });
}
