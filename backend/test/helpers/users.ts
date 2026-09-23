import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../src/lib/prisma.js';

/** Fields of a test user that a test may override. */
export interface TestUserInput {
  username?: string;
  email?: string;
  passwordHash?: string;
}

/**
 * Inserts a user directly into the database, bypassing the API.
 *
 * Unique username and e-mail are generated unless given. The password hash is a
 * placeholder until Stage 4, which replaces this helper's default with a real
 * argon2 hash and adds `loginAs`.
 *
 * @param prisma - Client connected to the test database.
 * @param input - Optional field overrides.
 * @returns The created user row.
 * @throws Prisma `P2002` if the given username or e-mail already exists.
 */
export async function createUser(prisma: PrismaClient, input: TestUserInput = {}) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      username: input.username ?? `driver_${suffix}`,
      email: input.email ?? `driver_${suffix}@example.com`,
      passwordHash: input.passwordHash ?? 'placeholder-hash',
    },
  });
}
