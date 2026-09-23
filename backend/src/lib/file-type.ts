import type { AllowedMimeType } from '@driver-docs/shared';

/** Leading bytes ("magic numbers") that identify each accepted format. */
const SIGNATURES: { mimeType: AllowedMimeType; bytes: number[] }[] = [
  // JPEG: SOI marker followed by the start of the next marker.
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: fixed 8-byte signature.
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // PDF: "%PDF-".
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

/**
 * Detects the format of a file from its first bytes, ignoring the file name and
 * the client-supplied `Content-Type`, which an attacker controls.
 *
 * @param content - The file content (only the first 8 bytes are read).
 * @returns The MIME type if the content is a JPEG, PNG or PDF; otherwise `null`.
 */
export function detectFileType(content: Buffer): AllowedMimeType | null {
  const match = SIGNATURES.find(
    ({ bytes }) =>
      content.length >= bytes.length && bytes.every((byte, index) => content[index] === byte),
  );
  return match?.mimeType ?? null;
}

/** File name extension for each accepted format, used in download file names. */
export const EXTENSIONS: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
