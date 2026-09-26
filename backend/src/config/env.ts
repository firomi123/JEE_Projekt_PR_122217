import { passwordSchema, usernameSchema } from '@driver-docs/shared';
import { z } from 'zod';

/** Log levels accepted by pino, plus `silent` (used by the test suite). */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * Checks that a string is standard base64 that decodes to exactly 32 bytes
 * (a 256-bit AES key).
 *
 * @param value - The candidate base64 string.
 * @returns `true` if the string is canonical base64 of a 32-byte value, else `false`.
 */
function isBase64Key256(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').length === 32;
}

/** Zod schema of the environment variables the backend reads (see .env.example). */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    // Number of reverse proxies in front of the API whose X-Forwarded-For is trusted
    // (1 behind the frontend nginx in Docker, 0 when the API is reached directly).
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    // Failed logins allowed per client IP within a 15-minute window.
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    // Liveness fails when the event loop was blocked longer than this since the last check.
    EVENT_LOOP_LAG_THRESHOLD_MS: z.coerce.number().int().min(10).default(1000),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters long'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'must look like 15m, 1h or 7d')
      .default('1h'),
    MASTER_ENCRYPTION_KEY: z
      .string()
      .refine(isBase64Key256, 'must be base64 of exactly 32 bytes (256-bit key)'),
    // Office (dispatcher) account created at startup (Stage 15); both or neither.
    // The same rules as for registration apply to the login and the password.
    OFFICE_USERNAME: usernameSchema.optional(),
    OFFICE_PASSWORD: passwordSchema.optional(),
    OFFICE_EMAIL: z.email().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.OFFICE_USERNAME && !env.OFFICE_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['OFFICE_PASSWORD'],
        message: 'required when OFFICE_USERNAME is set',
      });
    }
    if (env.OFFICE_PASSWORD && !env.OFFICE_USERNAME) {
      ctx.addIssue({
        code: 'custom',
        path: ['OFFICE_USERNAME'],
        message: 'required when OFFICE_PASSWORD is set',
      });
    }
  });

/** Validated, typed application configuration. */
export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  logLevel: (typeof LOG_LEVELS)[number];
  /** Trusted reverse-proxy hops (Express `trust proxy`). */
  trustProxy: number;
  /** Failed logins allowed per IP per 15 minutes. */
  loginRateLimitMax: number;
  /** Event-loop delay (ms) above which `GET /health` reports 503. */
  eventLoopLagThresholdMs: number;
  databaseUrl: string;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  /** 256-bit master key that wraps the per-file data keys (Stage 6). */
  masterEncryptionKey: Buffer;
  /** Office account ensured at startup, or `null` when not configured (Stage 15). */
  office: OfficeAccountConfig | null;
}

/** Login data of the office account created from the configuration. */
export interface OfficeAccountConfig {
  /** Lowercase login. */
  username: string;
  /** E-mail; `<username>@office.invalid` when OFFICE_EMAIL is not set. */
  email: string;
  password: string;
}

/** Thrown by {@link loadConfig} when one or more environment variables are missing or invalid. */
export class ConfigError extends Error {
  /**
   * @param problems - One human-readable line per invalid variable, e.g.
   *   `DATABASE_URL: Invalid input: expected string, received undefined`.
   */
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Validates the environment and converts it into a typed {@link Config}.
 *
 * Empty strings are treated as missing values, so a blank `JWT_SECRET=` line in
 * `.env` is reported instead of being accepted.
 *
 * @param env - The environment to read, normally `process.env`. Not modified.
 * @returns The validated configuration; optional variables get their defaults.
 * @throws {ConfigError} Listing every missing or invalid variable (not only the
 *   first one), without echoing any secret values.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const nonEmpty = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(nonEmpty);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    loginRateLimitMax: e.LOGIN_RATE_LIMIT_MAX,
    eventLoopLagThresholdMs: e.EVENT_LOOP_LAG_THRESHOLD_MS,
    databaseUrl: e.DATABASE_URL,
    s3: {
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
    },
    jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
    masterEncryptionKey: Buffer.from(e.MASTER_ENCRYPTION_KEY, 'base64'),
    office:
      e.OFFICE_USERNAME && e.OFFICE_PASSWORD
        ? {
            username: e.OFFICE_USERNAME,
            email: e.OFFICE_EMAIL ?? `${e.OFFICE_USERNAME}@office.invalid`,
            password: e.OFFICE_PASSWORD,
          }
        : null,
  };
}
