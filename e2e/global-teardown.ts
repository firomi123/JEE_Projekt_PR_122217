import MCR from 'monocart-coverage-reports';
import { COVERAGE_ENABLED, coverageOptions } from './coverage';

/**
 * Playwright global teardown: when `E2E_COVERAGE=1`, builds the frontend coverage
 * report (console summary, `coverage-e2e/coverage-summary.json`, HTML) from the
 * coverage collected by all tests.
 *
 * Side effects: writes the report files into `e2e/coverage-e2e`.
 */
export default async function globalTeardown(): Promise<void> {
  if (!COVERAGE_ENABLED) return;
  await MCR(coverageOptions).generate();
}
