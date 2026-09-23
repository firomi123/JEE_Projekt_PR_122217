import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Creates a Prisma client backed by a `pg` connection pool (Prisma 7 driver adapter).
 *
 * Creating the client does not open a connection; the pool connects lazily on the
 * first query. A connection attempt fails after 5 s instead of hanging, so the
 * readiness check reports an unreachable database quickly.
 *
 * @param databaseUrl - PostgreSQL connection string (`postgresql://user:pass@host:port/db`).
 * @returns A new PrismaClient. Create one per process and call `$disconnect()` on shutdown.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
