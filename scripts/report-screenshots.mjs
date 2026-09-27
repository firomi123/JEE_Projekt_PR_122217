#!/usr/bin/env node
/**
 * Prepares the demo data for the report screenshots and photographs the office panel.
 *
 * 1. Creates the demo driver `jan_kowalski` (password `Tajne123!`) with a profile and
 *    four documents through the API; the office account from `.env` accepts one and
 *    rejects another (with a reason). The driver's screens are then photographed on
 *    a real phone (adb, see README), logged in as this driver.
 * 2. Photographs the office panel (list, document with the decision form) in a
 *    1440×900 desktop browser into docs/sprawozdanie/img/zrzuty/biuro-*.png.
 * With `--office-only` step 1 is skipped (e.g. after documents were added on the phone).
 *
 * Usage: npm run docs:screenshots – runs this script against a disposable copy of the
 * Docker stack (scripts/e2e-docker.mjs), because it creates a demo account and
 * documents; it refuses to run without E2E_DISPOSABLE_TARGET=1 set by that wrapper.
 * Requires the Playwright browser (npm run install:browsers -w e2e) and
 * OFFICE_USERNAME / OFFICE_PASSWORD in the root `.env`.
 */
/* global document -- the page.evaluate callbacks run in the browser */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

if (process.env.E2E_DISPOSABLE_TARGET !== '1' || !process.env.E2E_BASE_URL) {
  console.error('Run this through `npm run docs:screenshots` (a disposable copy of the stack).');
  process.exit(1);
}
const baseURL = process.env.E2E_BASE_URL;
const outDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'sprawozdanie',
  'img',
  'zrzuty',
);
mkdirSync(outDir, { recursive: true });

/**
 * Reads one variable from the root `.env` file.
 *
 * @param {string} name - Variable name.
 * @returns {string} Its value.
 * @throws {Error} If the variable is missing or empty.
 */
function envValue(name) {
  const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const match = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(envFile, 'utf8'));
  if (!match?.[1]) throw new Error(`${name} is not set in .env`);
  return match[1].trim();
}
const office = { username: envValue('OFFICE_USERNAME'), password: envValue('OFFICE_PASSWORD') };

const username = 'jan_kowalski';
const password = 'Tajne123!';
const officeOnly = process.argv.includes('--office-only');

/**
 * Draws a simple CMR-like form as a PNG in the browser, so the preview shows a
 * realistic document instead of random pixels.
 *
 * @param {import('@playwright/test').Page} page - Any page of the app.
 * @param {string} title - Text printed in the header of the form.
 * @returns {Promise<Buffer>} The PNG bytes.
 */
async function documentImage(page, title) {
  const base64 = await page.evaluate((heading) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, 900, 1200);
    ctx.strokeStyle = '#b3261e';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 840, 1140);
    ctx.fillStyle = '#b3261e';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(heading, 60, 100);
    ctx.font = '22px sans-serif';
    const fields = [
      '1 Nadawca',
      '2 Odbiorca',
      '3 Miejsce przeznaczenia',
      '4 Miejsce załadowania',
      '5 Załączone dokumenty',
      '6 Znaki i numery',
      '16 Przewoźnik',
      '22 Podpis nadawcy',
      '24 Przesyłkę otrzymano',
    ];
    fields.forEach((field, i) => {
      const y = 150 + i * 115;
      ctx.strokeRect(60, y, 780, 100);
      ctx.fillText(field, 75, y + 30);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(
        [
          'Trans-Pol Sp. z o.o., Łódź',
          'Logistik GmbH, Berlin',
          'Berlin, DE',
          'Łódź, PL',
          'WZ 123/2026',
          'PAL 33 szt.',
          'Trans-Pol',
          'J. Kowalski',
          '24.09.2026',
        ][i],
        95,
        y + 70,
      );
      ctx.fillStyle = '#b3261e';
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, title);
  return Buffer.from(base64, 'base64');
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'pl-PL' });
const page = await context.newPage();
await page.goto('/logowanie');

if (!officeOnly) {
  // Demo account and documents through the API.
  await page.request.post('/api/auth/register', {
    data: { username, email: `${username}@example.com`, password, confirmPassword: password },
  });
  const login = await (
    await page.request.post('/api/auth/login', { data: { username, password } })
  ).json();
  const auth = { Authorization: `Bearer ${login.accessToken}` };
  const officeLogin = await (await page.request.post('/api/auth/login', { data: office })).json();
  const officeAuth = { Authorization: `Bearer ${officeLogin.accessToken}` };
  await page.request.put('/api/profile', {
    headers: auth,
    data: {
      firstName: 'Jan',
      lastName: 'Kowalski',
      phone: '+48 601 234 567',
      licenseNumber: '00123/15/1465',
      companyName: 'Trans-Pol Sp. z o.o.',
    },
  });
  const demo = [
    ['CMR', 'CMR Łódź – Berlin', 'PL 555/2026', 'SUBMITTED'],
    ['WZ', 'WZ magazyn Stryków', 'WZ/123/2026', 'ACCEPTED'],
    ['INVOICE', 'Faktura za paliwo', 'FV/09/2026', 'DRAFT'],
    ['CMR', 'CMR Poznań – Praga', 'PL 548/2026', 'REJECTED'],
  ];
  for (const [type, title, number, status] of demo) {
    const response = await page.request.post('/api/documents', {
      headers: auth,
      multipart: {
        type,
        title,
        number,
        file: {
          name: 'skan.png',
          mimeType: 'image/png',
          buffer: await documentImage(page, `CMR ${number}`),
        },
      },
    });
    const { document } = await response.json();
    if (status !== 'DRAFT') {
      await page.request.patch(`/api/documents/${document.id}`, {
        headers: auth,
        data: { status: 'SUBMITTED' },
      });
    }
    // Accepting and rejecting is up to the office.
    if (status === 'ACCEPTED' || status === 'REJECTED') {
      await page.request.post(`/api/office/documents/${document.id}/review`, {
        headers: officeAuth,
        data: {
          decision: status,
          comment:
            status === 'REJECTED'
              ? 'Nieczytelna pieczątka odbiorcy – zrób zdjęcie jeszcze raz'
              : null,
        },
      });
    }
  }
}

// Office panel in a desktop browser (1440×900).
const desktop = await browser.newContext({
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  baseURL,
  locale: 'pl-PL',
});
const officePage = await desktop.newPage();
await officePage.goto('/logowanie');
await officePage.getByLabel('Login').fill(office.username);
await officePage.getByLabel('Hasło').fill(office.password);
await officePage.getByRole('button', { name: 'Zaloguj się' }).click();
await officePage.getByTestId('office-row').first().waitFor();
await officePage.screenshot({ path: resolve(outDir, 'biuro-lista.png') });
// The newest submitted document (after the phone session: the real photo).
await officePage.getByTestId('office-row').first().getByRole('link').click();
await officePage.getByRole('img', { name: /Podgląd dokumentu/ }).waitFor();
await officePage.getByLabel('Komentarz dla kierowcy').fill('Brak podpisu odbiorcy w polu 24');
await officePage.screenshot({ path: resolve(outDir, 'biuro-dokument.png') });
await desktop.close();

await browser.close();
console.log(`Screenshots written to ${outDir}`);
