import { describe, expect, it } from 'vitest';
import { exeFile, jpegFile, pdfFile, pngFile } from '../../test/fixtures/files.js';
import { detectFileType } from './file-type.js';

describe('detectFileType', () => {
  it.each([
    ['JPEG', jpegFile(), 'image/jpeg'],
    ['PNG', pngFile(), 'image/png'],
    ['PDF', pdfFile(), 'application/pdf'],
  ])('recognizes %s by its signature', (_name, content, mimeType) => {
    expect(detectFileType(content)).toBe(mimeType);
  });

  it.each([
    ['a Windows executable', exeFile()],
    ['plain text', Buffer.from('Lista przewozowa CMR')],
    ['a GIF image', Buffer.from('GIF89a......')],
    ['an empty file', Buffer.alloc(0)],
    ['a truncated PNG signature', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['a PDF signature not at the start', Buffer.from(' %PDF-1.7')],
  ])('rejects %s', (_name, content) => {
    expect(detectFileType(content)).toBeNull();
  });
});
