import type { ProfileData } from '@driver-docs/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { DriverProfile } from '../generated/prisma/client.js';
import type { PrismaClient } from '../lib/prisma.js';

/** Data access for the `driver_profiles` table. */
export class ProfileRepository {
  /** @param prisma - Database client. */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds the profile of a user.
   *
   * @param userId - Owner's user id.
   * @returns The profile, or `null` if the user (and so the profile) does not exist.
   */
  async findByUserId(userId: string): Promise<DriverProfile | null> {
    return this.prisma.driverProfile.findUnique({ where: { userId } });
  }

  /**
   * Overwrites every editable field of a user's profile.
   *
   * @param userId - Owner's user id; only this user's row can be changed.
   * @param data - New values; `null` clears a field.
   * @returns The updated profile, or `null` if the user has no profile (account deleted).
   */
  async replace(userId: string, data: ProfileData): Promise<DriverProfile | null> {
    try {
      return await this.prisma.driverProfile.update({ where: { userId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
