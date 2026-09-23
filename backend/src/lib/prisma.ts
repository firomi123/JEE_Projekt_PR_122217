import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/** A finished query as reported by Prisma's `query` event. */
interface QueryEvent {
  /** Duration in milliseconds. */
  duration: number;
}

/**
 * Creates a Prisma client backed by a `pg` connection pool (Prisma 7 driver adapter).
 *
 * Creating the client does not open a connection; the pool connects lazily on the
 * first query. Timeouts keep a hanging database from hanging the API: connecting
 * fails after 5 s, PostgreSQL cancels a statement after 10 s (`statement_timeout`),
 * and the driver gives up on a query after 15 s. Query events are enabled so the
 * application can measure query durations (see {@link onQuery}).
 *
 * @param databaseUrl - PostgreSQL connection string (`postgresql://user:pass@host:port/db`).
 * @returns A new PrismaClient. Create one per process and call `$disconnect()` on shutdown.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10_000,
    query_timeout: 15_000,
  });
  const client = new PrismaClient({ adapter, log: [{ emit: 'event', level: 'query' }] });
  return client as unknown as PrismaClient;
}

/**
 * Registers a listener for every finished database query.
 *
 * @param prisma - A client created by {@link createPrismaClient} (query events enabled).
 * @param listener - Receives the query duration in milliseconds.
 */
export function onQuery(prisma: PrismaClient, listener: (durationMs: number) => void): void {
  (prisma as unknown as { $on(event: 'query', cb: (e: QueryEvent) => void): void }).$on(
    'query',
    (event) => listener(event.duration),
  );
}

export type { PrismaClient };
