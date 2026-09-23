import { randomBytes } from 'node:crypto';

/**
 * Sample files for upload tests. Each starts with the real signature of its format
 * and continues with random bytes, so every call produces different content (and a
 * different SHA-256) while still being recognized by the content-based type check.
 */

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Creates a JPEG-signed file.
 *
 * @param size - Total size in bytes (default 2 KiB).
 * @returns The file content.
 */
export function jpegFile(size = 2048): Buffer {
  return Buffer.concat([JPEG_HEADER, randomBytes(size - JPEG_HEADER.length)]);
}

/**
 * Creates a PNG-signed file.
 *
 * @param size - Total size in bytes (default 2 KiB).
 * @returns The file content.
 */
export function pngFile(size = 2048): Buffer {
  return Buffer.concat([PNG_HEADER, randomBytes(size - PNG_HEADER.length)]);
}

/**
 * Creates a small PDF-signed file with readable text inside, so tests can check
 * that this text does not appear in the encrypted object.
 *
 * @param text - Text embedded in the file.
 * @returns The file content.
 */
export function pdfFile(text = 'CMR 123/2026 Poznań'): Buffer {
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n% ${text}\n`),
    randomBytes(512),
    Buffer.from('\n%%EOF\n'),
  ]);
}

/** A Windows executable ("MZ" header) – must be rejected even if named `.pdf`. */
export function exeFile(): Buffer {
  return Buffer.concat([Buffer.from('MZ'), randomBytes(1024)]);
}
