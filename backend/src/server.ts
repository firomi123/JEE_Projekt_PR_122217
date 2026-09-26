import { APP_NAME } from '@driver-docs/shared';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';
import { createS3Client } from './lib/s3.js';
import { UserRepository } from './repositories/user.repository.js';
import { ensureOfficeAccount } from './services/office-account.js';

/** Maximum time a graceful shutdown may take before the process is killed. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Validates the environment or terminates the process.
 *
 * @returns The validated configuration.
 * Side effects: on invalid configuration prints every problem to stderr and exits
 * with code 1, so a misconfigured container fails immediately and visibly.
 */
function loadConfigOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const logger = createLogger(config);
const prisma = createPrismaClient(config.databaseUrl);
const s3 = createS3Client(config.s3);
const app = createApp({ config, logger, prisma, s3 });

// The office account comes from the configuration (Stage 15). A database problem
// here must not stop the API: readiness reports the database, and the account is
// ensured again on the next start.
await ensureOfficeAccount(new UserRepository(prisma), config.office, logger).catch(
  (error: unknown) => logger.error({ err: error }, 'Could not ensure the office account'),
);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, `${APP_NAME} API listening`);
});
// A client may not take longer than this to send a request (slow-loris protection);
// uploads of 10 MB over a slow mobile link still fit.
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;

let shuttingDown = false;

/**
 * Graceful shutdown: stops accepting connections, lets in-flight requests finish,
 * then closes the database pool and the S3 client. If that takes longer than
 * {@link SHUTDOWN_TIMEOUT_MS}, the process exits anyway.
 *
 * @param signal - Signal that triggered the shutdown (for the log).
 * @param exitCode - Exit code after a clean shutdown (0 for signals, 1 for crashes).
 * Side effects: terminates the process.
 */
function shutdown(signal: string, exitCode: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    void prisma
      .$disconnect()
      .catch((error: unknown) => logger.error({ err: error }, 'Error closing the database pool'))
      .finally(() => {
        s3.destroy();
        logger.info('Shutdown complete');
        process.exit(exitCode);
      });
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// Fail fast: after an unexpected error the process state is unknown, so it is not
// allowed to keep serving. Docker (restart: unless-stopped) starts a fresh one.
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception, exiting');
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection, exiting');
  shutdown('unhandledRejection', 1);
});
