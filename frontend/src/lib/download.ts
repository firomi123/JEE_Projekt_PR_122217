/**
 * Saves a Blob as a file through a temporary `<a download>` link.
 *
 * @param blob - File content.
 * @param fileName - Suggested file name.
 * Side effects: triggers a browser download; the object URL is revoked a second later.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
