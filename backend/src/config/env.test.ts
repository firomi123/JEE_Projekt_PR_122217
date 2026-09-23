import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

/** A complete, valid environment; tests remove or change single variables. */
const validEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'documents',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  JWT_SECRET: 'x'.repeat(32),
  MASTER_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

/**
 * Calls loadConfig and returns the thrown ConfigError.
 *
 * @param env - Environment to validate.
 * @returns The ConfigError thrown by loadConfig.
 * @throws If loadConfig does not throw a ConfigError.
 */
function configErrorFor(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('Expected loadConfig to throw a ConfigError');
}

describe('loadConfig', () => {
  it('maps a valid environment and applies defaults', () => {
    const config = loadConfig(validEnv);

    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      s3: { region: 'us-east-1', bucket: 'documents' },
      jwt: { expiresIn: '1h' },
    });
    expect(config.masterEncryptionKey).toHaveLength(32);
  });

  it('coerces PORT to a number', () => {
    expect(loadConfig({ ...validEnv, PORT: '8081' }).port).toBe(8081);
  });

  it('reports all missing variables at once', () => {
    const error = configErrorFor({});

    const names = error.problems.map((p) => p.split(':')[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
        'JWT_SECRET',
        'MASTER_ENCRYPTION_KEY',
      ]),
    );
  });

  it('treats an empty value as missing', () => {
    expect(configErrorFor({ ...validEnv, JWT_SECRET: '' }).problems[0]).toMatch(/^JWT_SECRET:/);
  });

  it.each([
    ['PORT', '70000'],
    ['PORT', 'abc'],
    ['DATABASE_URL', 'mysql://u:p@localhost/db'],
    ['S3_ENDPOINT', 'not a url'],
    ['JWT_SECRET', 'short'],
    ['JWT_EXPIRES_IN', 'one hour'],
    ['LOG_LEVEL', 'verbose'],
    ['NODE_ENV', 'staging'],
    ['MASTER_ENCRYPTION_KEY', Buffer.alloc(16).toString('base64')],
    ['MASTER_ENCRYPTION_KEY', 'not base64!'],
  ])('rejects invalid %s=%s', (name, value) => {
    const error = configErrorFor({ ...validEnv, [name]: value });

    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toMatch(new RegExp(`^${name}:`));
  });

  it('never includes the offending secret value in the error message', () => {
    const error = configErrorFor({ ...validEnv, JWT_SECRET: 'my-short-secret' });

    expect(error.message).not.toContain('my-short-secret');
  });
});
