import { describe, expect, it } from 'vitest';
import { checkFile } from './file-check';

/**
 * Creates a File of a given size and declared type without allocating its content.
 *
 * @param size - Reported size in bytes.
 * @param type - Declared MIME type.
 * @returns A File whose `size` is overridden.
 */
function fakeFile(size: number, type: string): File {
  const file = new File(['x'], 'plik', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('checkFile', () => {
  it.each(['image/jpeg', 'image/png', 'application/pdf', ''])('accepts type %j', (type) => {
    expect(checkFile(fakeFile(1000, type))).toBeNull();
  });

  it('rejects other declared types', () => {
    expect(checkFile(fakeFile(1000, 'image/gif'))).toBe('Dozwolone są tylko pliki JPG, PNG i PDF');
  });

  it('accepts exactly 10 MB and rejects one byte more', () => {
    expect(checkFile(fakeFile(10 * 1024 * 1024, 'image/png'))).toBeNull();
    expect(checkFile(fakeFile(10 * 1024 * 1024 + 1, 'image/png'))).toBe(
      'Plik jest za duży (maksymalnie 10 MB)',
    );
  });
});
