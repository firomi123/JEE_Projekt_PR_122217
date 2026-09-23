import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256 in Galois/Counter Mode: confidentiality and integrity in one primitive. */
const ALGORITHM = 'aes-256-gcm';
/** 96-bit nonce, the size recommended for GCM (NIST SP 800-38D). */
const IV_LENGTH = 12;
/** 128-bit authentication tag. */
const TAG_LENGTH = 16;
/** 256-bit keys. */
const KEY_LENGTH = 32;

/** Result of encrypting a file; everything except `ciphertext` goes to the database. */
export interface EncryptedFile {
  /** Encrypted file content, stored in object storage. */
  ciphertext: Buffer;
  /** Nonce used for the file (12 bytes). */
  iv: Buffer;
  /** GCM tag of the file (16 bytes). */
  authTag: Buffer;
  /** The file's data key encrypted with the master key: nonce ‖ ciphertext ‖ tag (60 bytes). */
  encryptedDataKey: Buffer;
}

/** Thrown when decryption fails: wrong key, wrong context or tampered data. */
export class DecryptionError extends Error {
  constructor() {
    super('Decryption failed: data was modified or does not belong to this context');
    this.name = 'DecryptionError';
  }
}

/**
 * Encrypts a buffer with AES-256-GCM.
 *
 * @param key - 32-byte key.
 * @param plaintext - Data to encrypt.
 * @param aad - Additional authenticated data: not encrypted, but must be identical
 *   when decrypting.
 * @returns The fresh random nonce, the ciphertext and the tag.
 */
function seal(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, authTag: cipher.getAuthTag() };
}

/**
 * Decrypts and authenticates AES-256-GCM data.
 *
 * @param key - 32-byte key.
 * @param iv - Nonce used for encryption.
 * @param ciphertext - Encrypted data.
 * @param authTag - Tag produced by encryption.
 * @param aad - The same additional authenticated data as used for encryption.
 * @returns The plaintext; returned only after the tag has been verified.
 * @throws {DecryptionError} If the key, nonce, AAD, ciphertext or tag does not match.
 */
function open(key: Buffer, iv: Buffer, ciphertext: Buffer, authTag: Buffer, aad: Buffer): Buffer {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new DecryptionError();
  }
}

/**
 * Envelope encryption of document files.
 *
 * Every file gets its own random 256-bit data key, which encrypts the file with
 * AES-256-GCM. The data key is then encrypted ("wrapped") with the master key from
 * the configuration and stored next to the file's metadata. The master key never
 * touches file data directly, a leaked data key exposes a single file, and the
 * master key could be rotated by re-wrapping the small data keys only.
 *
 * Both layers bind a context string (the version's storage key) as AAD, so an
 * encrypted file or wrapped key copied onto another version fails to decrypt.
 */
export class EncryptionService {
  /**
   * @param masterKey - 32-byte master key (`MASTER_ENCRYPTION_KEY`).
   * @throws {Error} If the key is not 32 bytes long.
   */
  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== KEY_LENGTH) throw new Error('Master key must be 32 bytes');
  }

  /**
   * Encrypts a file with a fresh data key and wraps that key with the master key.
   *
   * @param plaintext - Original file content.
   * @param context - Identifier the ciphertext is bound to (the storage key).
   * @returns Ciphertext for the object storage plus nonce, tag and wrapped key for the database.
   */
  encrypt(plaintext: Buffer, context: string): EncryptedFile {
    const aad = Buffer.from(context, 'utf8');
    const dataKey = randomBytes(KEY_LENGTH);
    try {
      const file = seal(dataKey, plaintext, aad);
      const wrapped = seal(this.masterKey, dataKey, aad);
      return {
        ciphertext: file.ciphertext,
        iv: file.iv,
        authTag: file.authTag,
        encryptedDataKey: Buffer.concat([wrapped.iv, wrapped.ciphertext, wrapped.authTag]),
      };
    } finally {
      dataKey.fill(0);
    }
  }

  /**
   * Unwraps the data key and decrypts a file, verifying both GCM tags.
   *
   * @param file - Ciphertext from storage plus nonce, tag and wrapped key from the database.
   * @param context - The same identifier that was passed to {@link encrypt}.
   * @returns The original file content.
   * @throws {DecryptionError} If anything was modified, belongs to another context,
   *   or was encrypted under a different master key.
   */
  decrypt(file: EncryptedFile, context: string): Buffer {
    const aad = Buffer.from(context, 'utf8');
    const wrapped = file.encryptedDataKey;
    if (wrapped.length !== IV_LENGTH + KEY_LENGTH + TAG_LENGTH) throw new DecryptionError();
    const dataKey = open(
      this.masterKey,
      wrapped.subarray(0, IV_LENGTH),
      wrapped.subarray(IV_LENGTH, IV_LENGTH + KEY_LENGTH),
      wrapped.subarray(IV_LENGTH + KEY_LENGTH),
      aad,
    );
    try {
      return open(dataKey, file.iv, file.ciphertext, file.authTag, aad);
    } finally {
      dataKey.fill(0);
    }
  }
}
