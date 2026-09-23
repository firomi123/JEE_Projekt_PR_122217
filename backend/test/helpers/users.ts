import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { LoginResponse } from '@driver-docs/shared';
import { hashPassword } from '../../src/lib/password.js';
import type { PrismaClient } from '../../src/lib/prisma.js';

/** Password of every user created by {@link createUser} unless overridden. */
export const DEFAULT_PASSWORD = 'Tajne123!';

/** Fields of a test user that a test may override. */
export interface TestUserInput {
  username?: string;
  email?: string;
  password?: string;
}

/** Cache of argon2 hashes by password, so tests do not re-hash the same password. */
const hashCache = new Map<string, Promise<string>>();

/**
 * Returns the argon2 hash of a password, computing it only once per test process.
 *
 * @param password - Plain-text password.
 * @returns A valid argon2id hash of the password.
 */
function cachedHash(password: string): Promise<string> {
  let hash = hashCache.get(password);
  if (!hash) {
    hash = hashPassword(password);
    hashCache.set(password, hash);
  }
  return hash;
}

/**
 * Inserts a user directly into the database, bypassing the API, with a real
 * argon2 hash so the user can log in, and an empty driver profile (as registration
 * creates one).
 *
 * Unique (lowercase) username and e-mail are generated unless given.
 *
 * @param prisma - Client connected to the test database.
 * @param input - Optional overrides; `password` defaults to {@link DEFAULT_PASSWORD}.
 * @returns The created user row.
 * @throws Prisma `P2002` if the given username or e-mail already exists.
 */
export async function createUser(prisma: PrismaClient, input: TestUserInput = {}) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      username: input.username ?? `driver_${suffix}`,
      email: input.email ?? `driver_${suffix}@example.com`,
      passwordHash: await cachedHash(input.password ?? DEFAULT_PASSWORD),
      profile: { create: {} },
    },
  });
}

/** Result of {@link loginAs}. */
export interface LoggedInUser {
  user: Awaited<ReturnType<typeof createUser>>;
  token: string;
  /** Ready-made `Authorization` header value: `Bearer <token>`. */
  authHeader: string;
}

/**
 * Creates a user and logs in through `POST /api/auth/login`, like a real client.
 *
 * @param app - Application under test.
 * @param prisma - Client connected to the test database.
 * @param input - Optional user overrides (see {@link createUser}).
 * @returns The user, its access token and the matching Authorization header.
 * @throws {Error} If the login request does not return 200.
 */
export async function loginAs(
  app: Express,
  prisma: PrismaClient,
  input: TestUserInput = {},
): Promise<LoggedInUser> {
  const user = await createUser(prisma, input);
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: input.password ?? DEFAULT_PASSWORD });
  if (response.status !== 200) {
    throw new Error(`loginAs failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const { accessToken } = response.body as LoginResponse;
  return { user, token: accessToken, authHeader: `Bearer ${accessToken}` };
}
