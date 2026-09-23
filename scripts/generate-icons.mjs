#!/usr/bin/env node
/**
 * Renders the PWA icons from frontend/public/icons/icon.svg with headless Chromium
 * (Playwright), so no image tool is needed:
 *   icon-192.png, icon-512.png   – regular icons ("any"),
 *   maskable-512.png             – icon inside the 80 % safe zone on a full-bleed
 *                                  background, for Android adaptive icons,
 *   apple-touch-icon.png (180)   – iOS home screen.
 * Run: node scripts/generate-icons.mjs (after `npm run install:browsers -w e2e`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const iconsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'frontend',
  'public',
  'icons',
);
const svg = readFileSync(resolve(iconsDir, 'icon.svg'), 'utf8');

/**
 * Renders the icon SVG to a square PNG file.
 *
 * @param {import('@playwright/test').Page} page - Browser page used for rendering.
 * @param {number} size - Output width and height in pixels.
 * @param {string} file - Output file name inside the icons directory.
 * @param {number} [padding] - Fraction of the size left as background around the
 *   icon (used for the maskable icon's safe zone).
 * @returns {Promise<void>} Resolves when the PNG is written.
 */
async function render(page, size, file, padding = 0) {
  const inner = Math.round(size * (1 - 2 * padding));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:#1f4e79;display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
     </body></html>`,
  );
  await page.screenshot({ path: resolve(iconsDir, file), omitBackground: padding === 0 });
}

const browser = await chromium.launch();
const page = await browser.newPage();
await render(page, 192, 'icon-192.png');
await render(page, 512, 'icon-512.png');
await render(page, 512, 'maskable-512.png', 0.1);
await render(page, 180, 'apple-touch-icon.png', 0.06);
await browser.close();
console.log(`Icons written to ${iconsDir}`);
