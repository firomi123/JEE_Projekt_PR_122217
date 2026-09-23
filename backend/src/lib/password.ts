import argon2 from 'argon2';

/**
 * Hashes a password with argon2id (library defaults: 64 MiB memory, 3 iterations,
 * parallelism 4, random 16-byte salt embedded in the result).
 *
 * @param password - Plain-text password.
 * @returns The encoded hash (`$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>`).
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Checks a password against a stored argon2 hash in constant time.
 *
 * @param hash - Encoded hash previously produced by {@link hashPassword}.
 * @param password - Plain-text password to check.
 * @returns `true` if the password matches; `false` if it does not or the hash is malformed.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Lazily computed hash of a random password, see {@link verifyAgainstDummy}. */
let dummyHash: Promise<string> | undefined;

/**
 * Performs a full argon2 verification against a throwaway hash and discards the
 * result. Called when a login names a user that does not exist, so that the
 * response takes as long as for a wrong password and response timing does not
 * reveal which usernames are registered.
 *
 * @param password - The password from the login attempt.
 * @returns Always resolves (to nothing) after the verification work is done.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}`);
  await verifyPassword(await dummyHash, password);
}
