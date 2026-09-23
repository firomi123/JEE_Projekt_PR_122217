import { Prisma } from '../generated/prisma/client.js';
import type { User } from '../generated/prisma/client.js';
import type { PrismaClient } from '../lib/prisma.js';

/** Data needed to create a user; the password must already be hashed. */
export interface NewUser {
  username: string;
  email: string;
  passwordHash: string;
}

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
   * Inserts a user.
   *
   * @param data - Normalized username and e-mail plus the password hash.
   * @returns The created user.
   * @throws {DuplicateUserError} If the username or e-mail was registered concurrently
   *   (unique constraint violation, Prisma error `P2002`).
   */
  async create(data: NewUser): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = JSON.stringify(error.meta ?? {});
        const fields = (['username', 'email'] as const).filter((f) => target.includes(f));
        throw new DuplicateUserError(fields.length > 0 ? [...fields] : ['username']);
      }
      throw error;
    }
  }
}
