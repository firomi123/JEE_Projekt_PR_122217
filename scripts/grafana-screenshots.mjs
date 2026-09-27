#!/usr/bin/env node
/**
 * Takes the monitoring screenshots used in the report (docs/sprawozdanie/img/zrzuty/)
 * from the running Docker stack: the four Grafana dashboards and the Prometheus
 * alert list.
 *
 * Read-only: it only opens pages (Grafana after logging in with the admin account
 * from the root `.env`), so unlike `report-screenshots.mjs` it may run against the
 * real stack.
 *
 * Usage: node scripts/grafana-screenshots.mjs [--range=now-3h] [--out=<dir>]
 * Env: GRAFANA_URL (default http://localhost:<GRAFANA_PORT or 3001>),
 *      PROMETHEUS_URL (default http://localhost:9090).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Reads one variable from the root `.env` file.
 *
 * @param {string} name - Variable name.
 * @param {string} [fallback] - Value used when the variable is missing or empty.
 * @returns {string} Its value (or the fallback).
 * @throws {Error} If the variable is missing and there is no fallback.
 */
function envValue(name, fallback) {
  const match = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(resolve(root, '.env'), 'utf8'));
  const value = match?.[1]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is not set in .env`);
}

/**
 * Returns the value of a `--name=value` command-line option.
 *
 * @param {string} name - Option name without the dashes.
 * @param {string} fallback - Value used when the option is not given.
 * @returns {string} The option value.
 */
function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const grafanaUrl =
  process.env.GRAFANA_URL ?? `http://localhost:${envValue('GRAFANA_PORT', '3001')}`;
const prometheusUrl = process.env.PROMETHEUS_URL ?? 'http://localhost:9090';
const range = option('range', 'now-3h');
const outDir = resolve(option('out', resolve(root, 'docs', 'sprawozdanie', 'img', 'zrzuty')));
mkdirSync(outDir, { recursive: true });

/** Dashboards to photograph: provisioned uid, output file name and viewport height. */
const DASHBOARDS = [
  { uid: 'driver-docs-app', file: 'grafana-aplikacja', height: 1300 },
  { uid: 'driver-docs-availability', file: 'grafana-dostepnosc', height: 1000 },
  { uid: 'driver-docs-containers', file: 'grafana-kontenery', height: 1000 },
  { uid: 'driver-docs-database', file: 'grafana-baza', height: 1000 },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'pl-PL',
  colorScheme: 'light',
});
const page = await context.newPage();

/**
 * Waits until the open dashboard has finished all queries: while queries run, the
 * refresh picker shows a "Cancel" button. The button must stay hidden for 3 s in a
 * row, because panels start their queries one after another (and the dashboards
 * refresh every 30 s, so `networkidle` is not reliable).
 *
 * @returns {Promise<void>} Resolves when the dashboard is idle.
 * @throws {Error} If queries are still running after 3 minutes.
 */
async function waitForQueries() {
  const cancel = page.getByRole('button', { name: 'Cancel' });
  const deadline = Date.now() + 180_000;
  let idleSince = Date.now();
  while (Date.now() - idleSince < 3000) {
    if (Date.now() > deadline) throw new Error('Grafana queries did not finish in 3 minutes');
    if (await cancel.isVisible()) idleSince = Date.now();
    await page.waitForTimeout(250);
  }
}

await page.goto(`${grafanaUrl}/login`);
await page.getByLabel(/username/i).fill(envValue('GRAFANA_ADMIN_USER', 'admin'));
await page
  .getByLabel(/password/i)
  .first()
  .fill(envValue('GRAFANA_ADMIN_PASSWORD'));
await page.getByRole('button', { name: /log in/i }).click();
await page.waitForURL((url) => !url.pathname.startsWith('/login'));

for (const { uid, file, height } of DASHBOARDS) {
  await page.setViewportSize({ width: 1440, height });
  await page.goto(`${grafanaUrl}/d/${uid}?orgId=1&from=${range}&to=now&kiosk&theme=light`);
  await page.getByText('Powered by').waitFor({ timeout: 60_000 });
  await waitForQueries();
  await page.screenshot({ path: resolve(outDir, `${file}.png`) });
  console.log(`${file}.png`);
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${prometheusUrl}/alerts`);
await page.getByText('HighErrorRate').waitFor({ timeout: 60_000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: resolve(outDir, 'prometheus-alerty.png'), fullPage: true });
console.log('prometheus-alerty.png');

await browser.close();
