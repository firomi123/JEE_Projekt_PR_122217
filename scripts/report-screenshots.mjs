#!/usr/bin/env node
/**
 * Takes the screenshots used in the report (docs/sprawozdanie/img/zrzuty/) from a
 * running deployment, in an emulated Pixel 7 phone with a fake camera.
 *
 * Creates a demo account with a few documents through the API, then photographs:
 * login, document list, document details, camera, photo editor and profile.
 *
 * Usage: node scripts/report-screenshots.mjs [baseUrl]   (default http://localhost:8090)
 * Requires the Playwright browser (npm run install:browsers -w e2e).
 */
/* global document -- the page.evaluate callbacks run in the browser */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const baseURL = process.argv[2] ?? 'http://localhost:8090';
const outDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'sprawozdanie',
  'img',
  'zrzuty',
);
mkdirSync(outDir, { recursive: true });

const username = `kierowca_${Date.now().toString(36)}`;
const password = 'Tajne123!';

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

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const context = await browser.newContext({
  ...devices['Pixel 7'],
  deviceScaleFactor: 2,
  baseURL,
  locale: 'pl-PL',
});
const page = await context.newPage();
page.on('dialog', (dialog) => dialog.accept());
/**
 * Saves a screenshot of the current viewport to the report's screenshot folder.
 * @param {string} name - File name without extension.
 * @returns {Promise<Buffer>} The PNG bytes (also written to `<outDir>/<name>.png`).
 */
const shot = (name) => page.screenshot({ path: resolve(outDir, `${name}.png`) });

await page.goto('/logowanie');
await shot('logowanie');

// Demo account and documents through the API.
await page.request.post('/api/auth/register', {
  data: { username, email: `${username}@example.com`, password, confirmPassword: password },
});
const login = await (
  await page.request.post('/api/auth/login', { data: { username, password } })
).json();
const auth = { Authorization: `Bearer ${login.accessToken}` };
const demo = [
  ['CMR', 'CMR Łódź – Berlin', 'PL 555/2026', 'SUBMITTED'],
  ['WZ', 'WZ magazyn Stryków', 'WZ/123/2026', 'ACCEPTED'],
  ['INVOICE', 'Faktura za paliwo', 'FV/09/2026', 'DRAFT'],
  ['CMR', 'CMR Poznań – Praga', 'PL 548/2026', 'REJECTED'],
];
let firstId;
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
  firstId ??= document.id;
  const path = {
    SUBMITTED: ['SUBMITTED'],
    ACCEPTED: ['SUBMITTED', 'ACCEPTED'],
    REJECTED: ['SUBMITTED', 'REJECTED'],
    DRAFT: [],
  }[status];
  for (const next of path) {
    await page.request.patch(`/api/documents/${document.id}`, {
      headers: auth,
      data: { status: next },
    });
  }
}

await page.getByLabel('Login').fill(username);
await page.getByLabel('Hasło').fill(password);
await page.getByRole('button', { name: 'Zaloguj się' }).click();
await page.getByText('Dokumentów: 4').waitFor();
await shot('lista');

await page.goto(`/dokumenty/${firstId}`);
await page.getByRole('img', { name: /Podgląd dokumentu/ }).waitFor();
await shot('szczegoly');

await page.goto('/dokumenty/nowy');
await page.getByRole('button', { name: 'Zrób zdjęcie' }).click();
await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
await shot('aparat');
await page.getByRole('button', { name: 'Wykonaj zdjęcie' }).click();
await page.getByTestId('photo-editor').waitFor();
await page.waitForTimeout(500);
await shot('kadrowanie');
await page.getByRole('button', { name: 'Użyj zdjęcia' }).click();
await page.getByTestId('compression-info').waitFor();
await page.getByLabel('Tytuł').fill('CMR Łódź – Berlin');
await shot('nowy-dokument');

await page.goto('/profil');
await page.getByLabel('Imię').fill('Jan');
await page.getByLabel('Nazwisko').fill('Kowalski');
await page.getByLabel('Telefon').fill('+48 601 234 567');
await page.getByLabel('Numer prawa jazdy').fill('00123/15/1465');
await page.getByLabel('Firma przewozowa').fill('Trans-Pol Sp. z o.o.');
await page.getByRole('button', { name: 'Zapisz profil' }).click();
await page.getByRole('status').waitFor();
await shot('profil');

await browser.close();
console.log(`Screenshots written to ${outDir}`);
