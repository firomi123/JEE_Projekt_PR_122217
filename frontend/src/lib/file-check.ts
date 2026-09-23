import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '@driver-docs/shared';
import { T } from '../i18n/texts';

/**
 * Checks a chosen file in the browser before uploading (size and declared type).
 * This only saves the user a pointless upload; the server checks the real content.
 *
 * @param file - The chosen file.
 * @returns A Polish error message, or `null` if the file looks acceptable.
 */
export function checkFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return T.newDocument.fileTooLarge;
  if (file.type && !(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return T.newDocument.fileWrongType;
  }
  return null;
}
