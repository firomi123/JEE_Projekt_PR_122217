import { Prisma } from '../generated/prisma/client.js';
import type { User, UserRole } from '../generated/prisma/client.js';
import type { PrismaClient } from '../lib/prisma.js';

/** Data needed to create a user; the password must already be hashed. */
export interface NewUser {
  username: string;
  email: string;
  passwordHash: string;
  /** `DRIVER` (the database default) unless given. */
  role?: UserRole;
}

/** A driver account with its profile's contact data (for the office). */
export type DriverWithProfile = Pick<User, 'id' | 'username'> & {
  profile: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    licenseNumber: string | null;
    companyName: string | null;
  } | null;
};

/** Profile fields shown to the office next to a driver. */
export const DRIVER_PROFILE_SELECT = {
  firstName: true,
  lastName: true,
  phone: true,
  licenseNumber: true,
  companyName: true,
} as const;

/** Thrown by {@link UserRepository.create} when a unique column already holds the value. */
export class DuplicateUserError extends Error {
  /** @param fields - The unique columns that collided (`username`, `email`). */
  constructor(readonly fields: ('username' | 'email')[]) {
    super(`Duplicate user: ${fields.join(', ')}`);
    this.name = 'DuplicateUserError';
  }
}

/** Data access for the `users` table. */
export class UserRepository {
  /** @param prisma - Database client. */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a user by id.
   *
   * @param id - User UUID. A value that is not a valid UUID simply finds nothing.
   * @returns The user, or `null` if there is none.
   */
  async findById(id: string): Promise<User | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Finds a user by (already lowercased) username.
   *
   * @param username - Normalized username.
   * @returns The user, or `null` if there is none.
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /**
   * Returns which of the given username and e-mail are already registered.
   *
   * @param username - Normalized username.
   * @param email - Normalized e-mail.
   * @returns The taken fields, in the order `username`, `email` (empty if both are free).
   */
  async findTakenFields(username: string, email: string): Promise<('username' | 'email')[]> {
    const existing = await this.prisma.user.findMany({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });
    const taken: ('username' | 'email')[] = [];
    if (existing.some((u) => u.username === username)) taken.push('username');
    if (existing.some((u) => u.email === email)) taken.push('email');
    return taken;
  }

  /**
   * Inserts a user together with an empty driver profile, atomically (one nested
   * write, so an account never exists without its profile).
   *
   * @param data - Normalized username and e-mail, the password hash and optionally the role.
   * @returns The created user.
   * @throws {DuplicateUserError} If the username or e-mail was registered concurrently
   *   (unique constraint violation, Prisma error `P2002`).
   */
  async create(data: NewUser): Promise<User> {
    try {
      return await this.prisma.user.create({ data: { ...data, profile: { create: {} } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = JSON.stringify(error.meta ?? {});
        const fields = (['username', 'email'] as const).filter((f) => target.includes(f));
        throw new DuplicateUserError(fields.length > 0 ? [...fields] : ['username']);
      }
      throw error;
    }
  }

  /**
   * Replaces a user's password hash.
   *
   * @param id - User id.
   * @param passwordHash - New argon2 hash.
   * Side effects: updates one row of `users`.
   */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /**
   * Lists all driver accounts (not office accounts) with their profile's contact data.
   *
   * @returns Drivers ordered by username.
   */
  async listDrivers(): Promise<DriverWithProfile[]> {
    return this.prisma.user.findMany({
      where: { role: 'DRIVER' },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, profile: { select: DRIVER_PROFILE_SELECT } },
    });
  }
}
