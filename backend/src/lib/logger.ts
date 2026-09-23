import { pino, type Logger } from 'pino';
import type { Config } from '../config/env.js';

/**
 * Creates the root pino logger.
 *
 * Production and test output is one JSON object per line on stdout (collected by
 * Docker / Loki). In development the output goes through `pino-pretty` for
 * readability. Authorization headers and cookies are redacted from request logs.
 *
 * @param config - Uses `logLevel` and `nodeEnv`.
 * @returns The root logger; per-request child loggers are derived from it.
 */
export function createLogger(config: Pick<Config, 'logLevel' | 'nodeEnv'>): Logger {
  return pino({
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    ...(config.nodeEnv === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l' } } }
      : {}),
  });
}
