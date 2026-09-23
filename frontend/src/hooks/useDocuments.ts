import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateDocumentInput } from '@driver-docs/shared';
import * as api from '../api/documents';

/** Query-cache keys of the documents feature. */
export const documentKeys = {
  all: ['documents'] as const,
  list: (filters: api.DocumentFilters) => ['documents', 'list', filters] as const,
  detail: (id: string) => ['documents', 'detail', id] as const,
  file: (id: string, versionNo: number) => ['documents', 'file', id, versionNo] as const,
};

/**
 * Loads one page of the document list.
 *
 * @param filters - Filters and paging (part of the cache key).
 * @returns The TanStack query; previous data is kept while the next page loads.
 */
export function useDocumentList(filters: api.DocumentFilters) {
  return useQuery({
    queryKey: documentKeys.list(filters),
    queryFn: () => api.listDocuments(filters),
    placeholderData: (previous) => previous,
  });
}

/**
 * Loads one document with versions and history.
 *
 * @param id - Document id.
 * @returns The TanStack query.
 */
export function useDocument(id: string) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => api.getDocument(id).then((response) => response.document),
  });
}

/**
 * Loads a version's decrypted file as a Blob (for the preview).
 *
 * @param id - Document id.
 * @param versionNo - Version number; nothing is loaded while it is `undefined`.
 * @returns The TanStack query.
 */
export function useVersionFile(id: string, versionNo: number | undefined) {
  return useQuery({
    queryKey: documentKeys.file(id, versionNo ?? 0),
    queryFn: () => api.fetchVersionFile(id, versionNo!),
    enabled: versionNo !== undefined,
    staleTime: Infinity,
  });
}

/**
 * Mutations on one document. Each one refreshes the document and the lists.
 *
 * @param id - Document id.
 * @returns `update`, `addVersion` and `remove` mutations.
 */
export function useDocumentMutations(id: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: documentKeys.all });
  return {
    update: useMutation({
      mutationFn: (changes: UpdateDocumentInput) => api.updateDocument(id, changes),
      onSuccess,
    }),
    addVersion: useMutation({
      mutationFn: (input: { file: Blob; fileName: string; changeNote?: string }) =>
        api.addVersion(id, input.file, input.fileName, input.changeNote),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: () => api.deleteDocument(id), onSuccess }),
  };
}
