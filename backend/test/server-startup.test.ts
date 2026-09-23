import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backendDir = resolve(import.meta.dirname, '..');

/**
 * Starts `src/server.ts` (through tsx) with the given environment and waits for it
 * to exit; a correctly configured server would keep running and hit the timeout.
 *
 * @param env - The complete environment of the child process.
 * @returns Exit status (null if killed by the timeout) and captured stderr.
 */
function startServer(env: NodeJS.ProcessEnv): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: backendDir,
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  return { status: result.status, stderr: result.stderr };
}

describe('server startup with invalid configuration', () => {
  it('exits with code 1 and names every missing variable', () => {
    const { PATH, SystemRoot } = process.env;

    const { status, stderr } = startServer({ PATH, SystemRoot, NODE_ENV: 'test' });

    expect(status).toBe(1);
    expect(stderr).toContain('Invalid configuration');
    for (const name of ['DATABASE_URL', 'S3_ENDPOINT', 'JWT_SECRET', 'MASTER_ENCRYPTION_KEY']) {
      expect(stderr).toContain(name);
    }
  });

  it('does not print secret values when a variable is invalid', () => {
    const { status, stderr } = startServer({ ...process.env, JWT_SECRET: 'too-short-secret' });

    expect(status).toBe(1);
    expect(stderr).toContain('JWT_SECRET');
    expect(stderr).not.toContain('too-short-secret');
  });
});
