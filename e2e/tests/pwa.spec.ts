import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createDocumentViaApi, registerThroughUi } from './helpers';

/**
 * Waits until the service worker is active and controls the page (after a reload,
 * because a page is only controlled by a worker that was active when it loaded).
 *
 * @param page - Page of the application.
 */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

test('links a valid web app manifest with installable icons', async ({ page, request }) => {
  await page.goto('/logowanie');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const response = await request.get(href!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'Aplikacja kierowcy – dokumenty przewozowe',
    short_name: 'Kierowca',
    lang: 'pl',
    start_url: '/',
    display: 'standalone',
    theme_color: '#1f4e79',
  });
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );
  for (const icon of manifest.icons as { src: string }[]) {
    const image = await request.get(icon.src);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toBe('image/png');
  }
});

test('starts offline from the service worker cache and shows the offline banner', async ({
  page,
  context,
}) => {
  await registerThroughUi(page);
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).toBeVisible();
  await expect(page.getByText('Brak połączenia z internetem.', { exact: false })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Brak połączenia z internetem.', { exact: false })).toHaveCount(0);
});

test('never stores API responses or document files in the service worker cache', async ({
  page,
}) => {
  await registerThroughUi(page);
  await waitForServiceWorker(page);
  const id = await createDocumentViaApi(page, { type: 'CMR', title: 'Poufny CMR' });
  await page.goto(`/dokumenty/${id}`);
  await expect(page.getByTestId('pdf-preview')).toBeVisible();

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });

  expect(cachedUrls.length).toBeGreaterThan(0);
  expect(cachedUrls.filter((url) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
});
