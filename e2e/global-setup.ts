import MCR from 'monocart-coverage-reports';
import { COVERAGE_ENABLED, coverageOptions } from './coverage';

/**
 * Playwright global setup, run once before the tests (but after the web servers
 * have started – building `shared` and migrating the test database therefore
 * happen in `prepare-backend.mjs`, run by the backend web server command).
 *
 * In coverage runs it clears the coverage cache of the previous run; otherwise
 * it does nothing.
 *
 * Side effects: deletes the monocart coverage cache directory in coverage runs.
 */
export default function globalSetup(): void {
  if (COVERAGE_ENABLED) MCR(coverageOptions).cleanCache();
}
