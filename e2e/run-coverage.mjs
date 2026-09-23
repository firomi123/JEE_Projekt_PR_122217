#!/usr/bin/env node
/**
 * Runs the whole end-to-end suite with frontend coverage measurement
 * (`E2E_COVERAGE=1`), in a way that works in every shell (cmd, PowerShell, bash).
 * The frontend is built with source maps for this run only.
 *
 * Usage: npm run test:e2e:coverage   (report: e2e/coverage-e2e/)
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['playwright', 'test'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_COVERAGE: '1' },
});
process.exit(result.status ?? 1);
