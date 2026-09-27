import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Prepares the backend for the E2E web server; run by the backend `webServer`
 * command right before `tsx src/server.ts`.
 *
 * Playwright starts the web servers *before* `globalSetup`, so this cannot live
 * there: on a clean checkout (CI) the backend would start without `shared/dist`,
 * without the generated Prisma client and against an unmigrated database.
 *
 * Steps: builds the shared package, generates the Prisma client and applies the
 * migrations to the test database (`DATABASE_URL` comes from the web server env).
 *
 * Side effects: writes `shared/dist` and `backend/src/generated`, changes the test
 * database schema. Exits the process with code 1 (and a hint to run
 * `npm run test:infra:up` when the migration fails) if a step fails.
 * @returns {void}
 */
function prepareBackend() {
  const root = resolve(import.meta.dirname, '..');
  const backend = resolve(root, 'backend');
  execSync('npm run build -w shared', { cwd: root, stdio: 'inherit' });
  execSync('npx prisma generate', { cwd: backend, stdio: 'inherit' });
  try {
    execSync('npx prisma migrate deploy', { cwd: backend, stdio: 'inherit' });
  } catch {
    console.error(
      'Cannot migrate the test database. Start it with `npm run test:infra:up` (repository root).',
    );
    process.exit(1);
  }
}

prepareBackend();
