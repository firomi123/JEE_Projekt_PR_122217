import type { CoverageReportOptions } from 'monocart-coverage-reports';

/** `true` when the end-to-end run should measure frontend code coverage. */
export const COVERAGE_ENABLED = process.env.E2E_COVERAGE === '1';

/**
 * Options of the frontend coverage report built from the V8 coverage that
 * Chromium collects while the end-to-end tests use the app. Only the application
 * bundle is kept (`/assets/*.js`), and through its source maps only the files of
 * `frontend/src` are reported (no dependencies).
 */
export const coverageOptions: CoverageReportOptions = {
  name: 'Frontend – pokrycie kodu przez testy E2E (Playwright)',
  outputDir: './coverage-e2e',
  reports: ['console-summary', 'json-summary', 'v8'],
  entryFilter: (entry) => entry.url.includes('/assets/') && entry.url.endsWith('.js'),
  sourceFilter: (sourcePath) => sourcePath.includes('src/') && !sourcePath.includes('node_modules'),
  cleanCache: false,
};
