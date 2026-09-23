import { APP_NAME } from '@driver-docs/shared';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';
import { createS3Client } from './lib/s3.js';

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
const app = createApp({
  config,
  logger,
  prisma: createPrismaClient(config.databaseUrl),
  s3: createS3Client(config.s3),
});

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, `${APP_NAME} API listening`);
});
