import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DecryptionError, EncryptionService, type EncryptedFile } from './encryption.service.js';

const masterKey = randomBytes(32);
const service = new EncryptionService(masterKey);
const context = 'documents/owner/doc/version-1';
const plaintext = Buffer.from('%PDF-1.7 list przewozowy CMR nr 123/2026 – Łódź → Poznań');

/**
 * Returns a copy of a buffer with one bit flipped.
 *
 * @param buffer - Original buffer (not modified).
 * @param index - Byte to modify.
 * @returns The modified copy.
 */
function flipBit(buffer: Buffer, index: number): Buffer {
  const copy = Buffer.from(buffer);
  copy[index] = copy[index]! ^ 0x01;
  return copy;
}

describe('EncryptionService', () => {
  it('decrypts what it encrypted', () => {
    const encrypted = service.encrypt(plaintext, context);

    expect(service.decrypt(encrypted, context)).toEqual(plaintext);
  });

  it('produces a ciphertext that does not contain the plaintext', () => {
    const { ciphertext } = service.encrypt(plaintext, context);

    expect(ciphertext.equals(plaintext)).toBe(false);
    expect(ciphertext.includes(Buffer.from('CMR'))).toBe(false);
  });

  it('uses a fresh data key and nonce for every file', () => {
    const a = service.encrypt(plaintext, context);
    const b = service.encrypt(plaintext, context);

    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.encryptedDataKey.equals(b.encryptedDataKey)).toBe(false);
  });

  it('has the documented sizes: 12-byte nonce, 16-byte tag, 60-byte wrapped key', () => {
    const encrypted = service.encrypt(plaintext, context);

    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
    expect(encrypted.encryptedDataKey).toHaveLength(60);
    expect(encrypted.ciphertext).toHaveLength(plaintext.length);
  });

  it('handles a large (10 MiB) file', () => {
    const big = randomBytes(10 * 1024 * 1024);

    expect(service.decrypt(service.encrypt(big, context), context).equals(big)).toBe(true);
  });

  describe('detects tampering (GCM authentication fails)', () => {
    const encrypted = service.encrypt(plaintext, context);
    const cases: [string, EncryptedFile][] = [
      [
        'one changed byte of the ciphertext',
        { ...encrypted, ciphertext: flipBit(encrypted.ciphertext, 5) },
      ],
      ['a changed authentication tag', { ...encrypted, authTag: flipBit(encrypted.authTag, 0) }],
      ['a changed nonce', { ...encrypted, iv: flipBit(encrypted.iv, 3) }],
      [
        'a changed wrapped data key',
        { ...encrypted, encryptedDataKey: flipBit(encrypted.encryptedDataKey, 20) },
      ],
      [
        'a truncated wrapped data key',
        { ...encrypted, encryptedDataKey: encrypted.encryptedDataKey.subarray(0, 59) },
      ],
      ['a truncated ciphertext', { ...encrypted, ciphertext: encrypted.ciphertext.subarray(1) }],
    ];

    it.each(cases)('rejects %s', (_case, tampered) => {
      expect(() => service.decrypt(tampered, context)).toThrow(DecryptionError);
    });
  });

  it('rejects a file moved to another context (e.g. swapped between versions)', () => {
    const encrypted = service.encrypt(plaintext, context);

    expect(() => service.decrypt(encrypted, 'documents/owner/doc/version-2')).toThrow(
      DecryptionError,
    );
  });

  it('rejects decryption with a different master key', () => {
    const encrypted = service.encrypt(plaintext, context);

    expect(() => new EncryptionService(randomBytes(32)).decrypt(encrypted, context)).toThrow(
      DecryptionError,
    );
  });

  it('refuses a master key that is not 32 bytes', () => {
    expect(() => new EncryptionService(randomBytes(16))).toThrow('32 bytes');
  });
});
