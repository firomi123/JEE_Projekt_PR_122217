#!/usr/bin/env node
/**
 * Runs a command against a disposable copy of the Docker stack, so end-to-end tests
 * and report screenshots never write accounts and documents into the real stack.
 *
 * The copy uses the same images and `.env` (secrets, office account) but its own
 * Compose project (`driver-docs-e2e`), so it gets empty volumes (database, MinIO)
 * and its own networks; host ports are moved so it can run next to the real stack.
 * Only the application services are started (frontend and its dependencies: backend,
 * migrate, postgres, minio, minio-init) – monitoring is not needed for the tests.
 * Every run starts from empty data (leftovers of a previous run are removed first).
 * When the command succeeds, the copy is removed with its volumes. When it fails,
 * the copy is kept running for inspection and the logs of its containers are saved to
 * `e2e/test-results/docker-stack.log` (Playwright's own report is in
 * `e2e/playwright-report/`); in CI (`CI` set) it is removed anyway.
 *
 * Usage:
 *   node scripts/e2e-docker.mjs                 – Playwright suite (npm run test:e2e:docker)
 *   node scripts/e2e-docker.mjs -- <command…>   – any command, e.g. the screenshot script
 * The command gets E2E_BASE_URL (the copy's frontend), E2E_DISPOSABLE_TARGET=1 and the
 * office login as E2E_OFFICE_USERNAME / E2E_OFFICE_PASSWORD.
 * E2E_KEEP_STACK=1 keeps the copy also after a successful run; E2E_KEEP_STACK=0 removes
 * it also after a failure.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'driver-docs-e2e';
/** Host ports of the copy (the real stack uses 8090, 5432, 9000, 9001). */
const PORTS = {
  FRONTEND_PORT: '8091',
  POSTGRES_PORT: '5436',
  MINIO_API_PORT: '9007',
  MINIO_CONSOLE_PORT: '9008',
};
const baseUrl = `http://localhost:${PORTS.FRONTEND_PORT}`;

/**
 * Reads one variable from the root `.env` file.
 *
 * @param {string} name - Variable name.
 * @returns {string} The value, or an empty string when it is not set.
 */
function envValue(name) {
  const match = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(resolve(root, '.env'), 'utf8'));
  return match?.[1]?.trim() ?? '';
}

/**
 * Runs a command with inherited output.
 *
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {NodeJS.ProcessEnv} env - Environment of the child process.
 * @param {string} cwd - Working directory.
 * @returns {number} The exit code (1 if the process could not be started).
 */
function run(command, args, env, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status ?? 1;
}

const composeEnv = { ...process.env, ...PORTS };
/**
 * Runs `docker compose` for the disposable project, with its host ports.
 * @param {...string} args - Compose subcommand and its arguments.
 * @returns {number} The exit code.
 */
const compose = (...args) => run('docker', ['compose', '-p', PROJECT, ...args], composeEnv);

const separator = process.argv.indexOf('--');
const custom = separator >= 0 ? process.argv.slice(separator + 1) : [];

// Leftovers of a previous (failed, kept) run must not leak into this one.
compose('down', '-v', '--remove-orphans');
console.log(`Starting a disposable stack "${PROJECT}" at ${baseUrl} …`);
let exitCode = compose('up', '-d', '--build', '--wait', 'frontend');
if (exitCode === 0) {
  const env = {
    ...process.env,
    E2E_BASE_URL: baseUrl,
    E2E_DISPOSABLE_TARGET: '1',
    E2E_OFFICE_USERNAME: envValue('OFFICE_USERNAME'),
    E2E_OFFICE_PASSWORD: envValue('OFFICE_PASSWORD'),
  };
  exitCode =
    custom.length > 0
      ? run(custom[0], custom.slice(1), env)
      : run('npx', ['playwright', 'test'], env, resolve(root, 'e2e'));
} else {
  console.error('The disposable stack did not become healthy.');
}

const keep =
  process.env.E2E_KEEP_STACK === '1' ||
  (exitCode !== 0 && process.env.E2E_KEEP_STACK !== '0' && !process.env.CI);

if (exitCode !== 0) {
  const logs = spawnSync('docker', ['compose', '-p', PROJECT, 'logs', '--no-color'], {
    cwd: root,
    env: composeEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const logFile = resolve(root, 'e2e', 'test-results', 'docker-stack.log');
  mkdirSync(dirname(logFile), { recursive: true });
  writeFileSync(logFile, `${logs.stdout ?? ''}${logs.stderr ?? ''}`);
  console.error(`Failed. Logs of the disposable stack: ${logFile}`);
}

if (keep) {
  console.log(
    `Leaving "${PROJECT}" running at ${baseUrl} (database on 127.0.0.1:${PORTS.POSTGRES_PORT}). ` +
      `Remove it with: docker compose -p ${PROJECT} down -v (the next run removes it too).`,
  );
} else {
  compose('down', '-v', '--remove-orphans');
}
process.exit(exitCode);
