import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { registerThroughUi, tokenOf } from './helpers';

/**
 * Reads a document's versions through the API (as the logged-in user).
 *
 * @param page - Page with a logged-in user.
 * @param id - Document id.
 * @returns The versions (newest first).
 */
async function versionsOf(page: Page, id: string) {
  const response = await page.request.get(`/api/documents/${id}`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
  });
  return (await response.json()).document.versions as { mimeType: string; sizeBytes: number }[];
}

/**
 * Generates a large, photo-like JPEG in the browser (gradient plus thousands of
 * small coloured shapes – realistic entropy, unlike pure noise which no JPEG
 * encoder can shrink).
 *
 * @param page - Any page.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns The JPEG bytes.
 */
async function bigPhoto(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f4f1e8');
      gradient.addColorStop(1, '#c9d6e3');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 40000; i++) {
        ctx.fillStyle = `hsl(${Math.random() * 360} 40% ${30 + Math.random() * 50}%)`;
        ctx.fillRect(
          Math.random() * width,
          Math.random() * height,
          2 + Math.random() * 12,
          2 + Math.random() * 6,
        );
      }
      return canvas.toDataURL('image/jpeg', 0.97).split(',')[1]!;
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

test.beforeEach(async ({ page }) => {
  await registerThroughUi(page);
});

test('takes a photo with the camera, crops and rotates it, and saves it as a document', async ({
  page,
}) => {
  await page.goto('/dokumenty/nowy');

  await page.getByRole('button', { name: 'Zrób zdjęcie' }).click();
  const preview = page.getByTestId('camera-preview');
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Wykonaj zdjęcie' }).click();

  await expect(page.getByTestId('photo-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Obróć o 90°' }).click();
  await page.getByRole('button', { name: 'Użyj zdjęcia' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('selected-file')).toContainText('zdjecie-dokumentu.jpg');
  await expect(page.getByTestId('compression-info')).toContainText('Zdjęcie zmniejszone');
  await page.getByLabel('Tytuł').fill('CMR ze zdjęcia');
  await page.getByRole('button', { name: 'Zapisz dokument' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CMR ze zdjęcia');
  await expect(page.getByRole('img', { name: 'Podgląd dokumentu CMR ze zdjęcia' })).toBeVisible();
  const id = page.url().split('/').pop()!;
  const [version] = await versionsOf(page, id);
  expect(version!.mimeType).toBe('image/jpeg');
  expect(version!.sizeBytes).toBeLessThan(1024 * 1024);
});

test('stops the camera when the camera view is closed', async ({ page }) => {
  await page.goto('/dokumenty/nowy');
  await page.getByRole('button', { name: 'Zrób zdjęcie' }).click();
  await expect(page.getByTestId('camera-preview')).toBeVisible();
  /**
   * Counts the live tracks of the stream attached to the page's `<video>` element.
   * @returns The number of tracks in state `live`; 0 when there is no video or stream.
   */
  const liveTracks = () =>
    page.evaluate(() => {
      const video = document.querySelector('video');
      const stream = video?.srcObject as MediaStream | null;
      return stream ? stream.getTracks().filter((t) => t.readyState === 'live').length : 0;
    });
  await expect.poll(liveTracks).toBe(1);
  const tracks = await page.evaluateHandle(() =>
    (document.querySelector('video')!.srcObject as MediaStream).getTracks(),
  );

  await page.getByRole('button', { name: 'Zamknij aparat' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await tracks.evaluate((all) => all.map((t) => t.readyState))).toEqual(['ended']);
});

test('explains a refused camera permission and offers the file fallback', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await page.goto('/dokumenty/nowy');

  await page.getByRole('button', { name: 'Zrób zdjęcie' }).click();

  await expect(page.getByRole('alert')).toContainText('Brak dostępu do aparatu');
  const fallback = page.getByLabel('Wybierz lub zrób zdjęcie');
  await expect(fallback).toHaveAttribute('capture', 'environment');
  await fallback.setInputFiles({
    name: 'z-galerii.jpg',
    mimeType: 'image/jpeg',
    buffer: await bigPhoto(page, 800, 600),
  });
  await expect(page.getByTestId('photo-editor')).toBeVisible();
});

test('falls back to the file input when the browser has no camera API', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  });
  await page.goto('/dokumenty/nowy');

  await page.getByRole('button', { name: 'Zrób zdjęcie' }).click();

  await expect(page.getByRole('alert')).toContainText('Aparat nie jest dostępny');
  await expect(page.getByLabel('Wybierz lub zrób zdjęcie')).toBeAttached();
});

test('compresses a large photo chosen from the device before uploading it', async ({ page }) => {
  await page.goto('/dokumenty/nowy');
  const photo = await bigPhoto(page, 4000, 3000);
  expect(photo.length).toBeGreaterThan(1024 * 1024);

  await page
    .getByLabel('Plik (JPG, PNG lub PDF, maks. 10 MB)')
    .setInputFiles({ name: 'IMG_1234.jpg', mimeType: 'image/jpeg', buffer: photo });

  await expect(page.getByTestId('compression-info')).toContainText('(2000×1500 px)');
  await page.getByLabel('Tytuł').fill('Duże zdjęcie');
  await page.getByRole('button', { name: 'Zapisz dokument' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Duże zdjęcie');
  const id = page.url().split('/').pop()!;
  const [version] = await versionsOf(page, id);
  expect(version!.mimeType).toBe('image/jpeg');
  expect(version!.sizeBytes).toBeLessThan(1024 * 1024);
  expect(version!.sizeBytes).toBeLessThan(photo.length);
});
