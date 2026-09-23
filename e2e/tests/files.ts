import { randomBytes } from 'node:crypto';

/** A tiny but valid 1×1 PNG, so the browser can actually display it in the preview. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** A file to put into a file input with `setInputFiles`. */
export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * A valid PNG image (displayable in the preview).
 *
 * @param name - File name.
 * @returns The file.
 */
export function pngFile(name = 'skan.png'): TestFile {
  return { name, mimeType: 'image/png', buffer: PNG_1X1 };
}

/**
 * A small PDF-signed file with random content (unique checksum).
 *
 * @param name - File name.
 * @returns The file.
 */
export function pdfFile(name = 'cmr.pdf'): TestFile {
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2048), Buffer.from('\n%%EOF\n')]),
  };
}

/**
 * A Windows executable disguised as a PDF (name and declared type), which only the
 * server's content check can reject.
 *
 * @returns The file.
 */
export function disguisedExe(): TestFile {
  return {
    name: 'faktura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('MZ'), randomBytes(1024)]),
  };
}
