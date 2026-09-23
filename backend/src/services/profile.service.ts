import type { ProfileData, ProfileDto } from '@driver-docs/shared';
import type { DriverProfile } from '../generated/prisma/client.js';
import { UnauthorizedError } from '../errors/app-error.js';
import type { ProfileRepository } from '../repositories/profile.repository.js';

/**
 * Converts a profile row into the public DTO (drops ids and creation time).
 *
 * @param profile - Database row.
 * @returns The editable fields plus `updatedAt` as an ISO timestamp.
 */
export function toProfileDto(profile: DriverProfile): ProfileDto {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    licenseNumber: profile.licenseNumber,
    companyName: profile.companyName,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/**
 * Driver profile logic. Every user has exactly one profile (created with the
 * account), so a missing profile means the account was deleted after the token
 * was issued, which is reported as 401 like on `/api/auth/me`.
 */
export class ProfileService {
  /** @param profiles - Profile data access. */
  constructor(private readonly profiles: ProfileRepository) {}

  /**
   * Returns the profile of the authenticated user.
   *
   * @param userId - The `sub` of a verified access token.
   * @returns The profile DTO.
   * @throws {UnauthorizedError} If the account no longer exists.
   */
  async get(userId: string): Promise<ProfileDto> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) throw new UnauthorizedError('Account no longer exists');
    return toProfileDto(profile);
  }

  /**
   * Replaces the authenticated user's profile with new values.
   *
   * @param userId - The `sub` of a verified access token; only this user's profile is changed.
   * @param data - Validated, normalized profile (`null` clears a field).
   * @returns The updated profile DTO.
   * Side effects: updates one row in `driver_profiles`.
   * @throws {UnauthorizedError} If the account no longer exists.
   */
  async update(userId: string, data: ProfileData): Promise<ProfileDto> {
    const profile = await this.profiles.replace(userId, data);
    if (!profile) throw new UnauthorizedError('Account no longer exists');
    return toProfileDto(profile);
  }
}
