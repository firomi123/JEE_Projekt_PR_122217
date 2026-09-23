import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/lib/prisma.js';
import { testEnv } from './env.js';

const backendDir = resolve(import.meta.dirname, '..');

/**
 * Vitest global setup, run once before all test files.
 *
 * Verifies that the test database from docker-compose.test.yml is reachable and
 * applies all Prisma migrations to it (`prisma migrate deploy`, idempotent).
 *
 * Side effects: connects to PostgreSQL and changes its schema; spawns the Prisma CLI.
 * @throws {Error} With a hint to run `npm run test:infra:up` when the database is
 *   unreachable, or the Prisma CLI error when a migration fails.
 */
export default async function setup(): Promise<void> {
  const databaseUrl = testEnv.DATABASE_URL;
  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Test database at ${new URL(databaseUrl).host} is unreachable. ` +
        'Start it with `npm run test:infra:up` (from the repository root).',
      { cause: error },
    );
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    env: { ...process.env, ...testEnv },
    stdio: 'pipe',
  });
}
