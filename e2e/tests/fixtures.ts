import { test as base } from '@playwright/test';
import MCR from 'monocart-coverage-reports';
import { COVERAGE_ENABLED, coverageOptions } from '../coverage';

/**
 * Playwright `test` with an automatic fixture that, when `E2E_COVERAGE=1`, records
 * the JavaScript coverage of every test's page (Chromium V8 coverage) and adds it
 * to the shared coverage cache; the report is generated in the global teardown.
 * Without the variable it behaves exactly like the plain `test`.
 */
export const test = base.extend<{ jsCoverage: void }>({
  jsCoverage: [
    async ({ page }, use) => {
      if (!COVERAGE_ENABLED) {
        await use();
        return;
      }
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      const coverage = await page.coverage.stopJSCoverage();
      await MCR(coverageOptions).add(coverage);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
