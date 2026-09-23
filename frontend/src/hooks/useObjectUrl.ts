import { useEffect, useMemo } from 'react';

/**
 * Creates an object URL (`blob:…`) for a Blob and revokes it when the Blob changes
 * or the component unmounts, so previews do not leak memory.
 *
 * @param blob - The file to display, or `undefined`.
 * @returns The object URL, or `undefined` while there is no Blob.
 */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
