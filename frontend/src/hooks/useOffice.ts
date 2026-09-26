import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewDocumentInput } from '@driver-docs/shared';
import * as api from '../api/office';

/** Query-cache keys of the office panel. */
export const officeKeys = {
  all: ['office'] as const,
  list: (filters: api.OfficeDocumentFilters) => ['office', 'list', filters] as const,
  detail: (id: string) => ['office', 'detail', id] as const,
  file: (id: string, versionNo: number) => ['office', 'file', id, versionNo] as const,
  drivers: ['office', 'drivers'] as const,
};

/**
 * Loads one page of the office document list.
 *
 * Always refetched when a screen opens (`staleTime: 0`): documents are changed by
 * two parties now (the driver and the office), so a cached copy may be outdated.
 *
 * @param filters - Filters and paging (part of the cache key).
 * @returns The TanStack query; previous data is kept while the next page loads.
 */
export function useOfficeDocumentList(filters: api.OfficeDocumentFilters) {
  return useQuery({
    queryKey: officeKeys.list(filters),
    queryFn: () => api.listOfficeDocuments(filters),
    staleTime: 0,
    placeholderData: (previous) => previous,
  });
}

/**
 * Loads one document of any driver with versions, history and the driver.
 *
 * Always refetched when a screen opens (`staleTime: 0`): documents are changed by
 * two parties now (the driver and the office), so a cached copy may be outdated.
 *
 * @param id - Document id.
 * @returns The TanStack query.
 */
export function useOfficeDocument(id: string) {
  return useQuery({
    queryKey: officeKeys.detail(id),
    queryFn: () => api.getOfficeDocument(id).then((response) => response.document),
    staleTime: 0,
  });
}

/**
 * Loads a version file of any driver's document as a Blob (for the preview).
 *
 * @param id - Document id.
 * @param versionNo - Version number; nothing is loaded while it is `undefined`.
 * @returns The TanStack query.
 */
export function useOfficeVersionFile(id: string, versionNo: number | undefined) {
  return useQuery({
    queryKey: officeKeys.file(id, versionNo ?? 0),
    queryFn: () => api.fetchOfficeVersionFile(id, versionNo!),
    enabled: versionNo !== undefined,
    staleTime: Infinity,
  });
}

/**
 * Loads the drivers (for the driver filter).
 *
 * @returns The TanStack query.
 */
export function useDrivers() {
  return useQuery({
    queryKey: officeKeys.drivers,
    queryFn: () => api.listDrivers().then((response) => response.drivers),
    staleTime: 60_000,
  });
}

/**
 * Decision of the office about one document. On success the document and the lists
 * of the office are refreshed.
 *
 * @param id - Document id.
 * @returns The TanStack mutation taking the decision and the comment.
 */
export function useReview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (review: ReviewDocumentInput) => api.reviewDocument(id, review),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: officeKeys.all }),
  });
}
