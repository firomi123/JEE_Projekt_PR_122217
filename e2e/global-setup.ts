import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import MCR from 'monocart-coverage-reports';
import { COVERAGE_ENABLED, coverageOptions } from './coverage';
import { e2eBackendEnv } from './env';

/**
 * Playwright global setup, run once before the web servers start.
 *
 * Builds the shared package (the backend and frontend import its `dist/`) and
 * applies the Prisma migrations to the test database. In coverage runs it also
 * clears the coverage cache of the previous run.
 *
 * Side effects: writes `shared/dist`, changes the test database schema.
 * @throws {Error} With a hint to run `npm run test:infra:up` when the test
 *   database is not running (the migration command fails).
 */
export default function globalSetup(): void {
  if (COVERAGE_ENABLED) MCR(coverageOptions).cleanCache();
  const root = resolve(import.meta.dirname, '..');
  execSync('npm run build -w shared', { cwd: root, stdio: 'pipe' });
  try {
    execSync('npx prisma migrate deploy', {
      cwd: resolve(root, 'backend'),
      env: { ...process.env, ...e2eBackendEnv },
      stdio: 'pipe',
    });
  } catch (error) {
    throw new Error(
      'Cannot migrate the test database. Start it with `npm run test:infra:up` (repository root).',
      { cause: error },
    );
  }
}
