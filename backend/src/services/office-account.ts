import type { Logger } from 'pino';
import type { OfficeAccountConfig } from '../config/env.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import type { UserRepository } from '../repositories/user.repository.js';

/** What {@link ensureOfficeAccount} did. */
export type OfficeAccountResult =
  'disabled' | 'created' | 'unchanged' | 'password-updated' | 'conflict';

/**
 * Makes sure the office account from the configuration exists, so that office
 * accounts never come from public registration (which always creates drivers).
 *
 * - Not configured → nothing happens.
 * - Missing → created with role `OFFICE` (and an empty profile, like every account).
 * - Existing office account → its password is set to the configured one if it
 *   differs (the configuration is the source of truth); nothing else changes.
 * - Existing **driver** account with the same login → left untouched and an error
 *   is logged; a driver is never promoted to the office, because anyone could have
 *   registered that login.
 *
 * @param users - User data access.
 * @param office - Office account from the configuration, or `null`.
 * @param logger - Logs what was done (never the password).
 * @returns What was done.
 * Side effects: may insert a user (+ profile) or update a password hash.
 * @throws Database errors (the caller decides whether startup continues).
 */
export async function ensureOfficeAccount(
  users: UserRepository,
  office: OfficeAccountConfig | null,
  logger: Logger,
): Promise<OfficeAccountResult> {
  if (!office) {
    logger.info('No office account configured (OFFICE_USERNAME / OFFICE_PASSWORD)');
    return 'disabled';
  }
  const existing = await users.findByUsername(office.username);
  if (!existing) {
    await users.create({
      username: office.username,
      email: office.email,
      passwordHash: await hashPassword(office.password),
      role: 'OFFICE',
    });
    logger.info({ username: office.username }, 'Office account created');
    return 'created';
  }
  if (existing.role !== 'OFFICE') {
    logger.error(
      { username: office.username },
      'OFFICE_USERNAME belongs to a driver account; it was not turned into an office account',
    );
    return 'conflict';
  }
  if (await verifyPassword(existing.passwordHash, office.password)) return 'unchanged';
  await users.updatePasswordHash(existing.id, await hashPassword(office.password));
  logger.info(
    { username: office.username },
    'Office account password updated from the configuration',
  );
  return 'password-updated';
}
