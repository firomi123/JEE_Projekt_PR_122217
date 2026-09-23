import { afterAll, beforeEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrismaClient, type PrismaClient } from '../../src/lib/prisma.js';
import { createS3Client } from '../../src/lib/s3.js';

/** Everything a functional test needs: the app and direct access to its dependencies. */
export interface TestContext {
  app: Express;
  config: Config;
  prisma: PrismaClient;
  s3: S3Client;
}

/**
 * Builds the application exactly as `server.ts` does, from the test environment
 * (vitest.config.ts) with optional overrides, e.g. an unreachable database URL.
 *
 * @param envOverrides - Environment variables replacing the test defaults.
 * @returns The app with its own Prisma and S3 clients. The caller must
 *   `prisma.$disconnect()` when done (see {@link useTestApp}).
 */
export function buildTestApp(envOverrides: Record<string, string> = {}): TestContext {
  const config = loadConfig({ ...process.env, ...envOverrides });
  const prisma = createPrismaClient(config.databaseUrl);
  const s3 = createS3Client(config.s3);
  const app = createApp({ config, logger: createLogger(config), prisma, s3 });
  return { app, config, prisma, s3 };
}

/**
 * Deletes all rows from every application table (keeps the schema and the Prisma
 * migration history). Uses one `TRUNCATE … RESTART IDENTITY CASCADE`.
 *
 * @param prisma - Client connected to the test database.
 * Side effects: irreversibly empties the tables of that database.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * Registers hooks for a test file that uses the real test database: builds one app
 * for the file, empties the database before every test and disconnects after all.
 *
 * @returns The shared test context (valid inside tests and hooks).
 */
export function useTestApp(): TestContext {
  const context = buildTestApp();
  beforeEach(async () => {
    await resetDatabase(context.prisma);
  });
  afterAll(async () => {
    await context.prisma.$disconnect();
    context.s3.destroy();
  });
  return context;
}
