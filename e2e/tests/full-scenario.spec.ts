import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { PASSWORD, uniqueUsername } from './helpers';

/**
 * The complete path of a driver through the application, in one test, on whatever
 * deployment E2E_BASE_URL points at (for Stage 12: the Docker stack behind nginx):
 * registration → profile → photo with the camera → document → new version →
 * status change → download → logout → login again.
 */
test('full driver scenario: registration to logout', async ({ page }) => {
  test.setTimeout(180_000);
  page.on('dialog', (dialog) => dialog.accept());
  const username = uniqueUsername('kierowca');

  await test.step('register (automatic login)', async () => {
    await page.goto('/rejestracja');
    await page.getByLabel('Login').fill(username);
    await page.getByLabel('Adres e-mail').fill(`${username}@example.com`);
    await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Powtórz hasło').fill(PASSWORD);
    await page.getByRole('button', { name: 'Załóż konto' }).click();
    await expect(page.getByTestId('current-user')).toHaveText(username);
  });

  await test.step('fill in the driver profile', async () => {
    await page.getByRole('link', { name: 'Profil' }).click();
    await page.getByLabel('Imię').fill('Łukasz');
    await page.getByLabel('Nazwisko').fill('Wiśniewski');
    await page.getByLabel('Telefon').fill('+48 601 234 567');
    await page.getByLabel('Numer prawa jazdy').fill('00123/15/1465');
    await page.getByLabel('Firma przewozowa').fill('Trans-Pol Sp. z o.o.');
    await page.getByRole('button', { name: 'Zapisz profil' }).click();
    await expect(page.getByRole('status')).toHaveText('Profil zapisany.');
  });

  await test.step('photograph a document with the camera and save it', async () => {
    await page.getByRole('link', { name: 'Dodaj', exact: true }).click();
    await page.getByLabel('Typ dokumentu').selectOption({ label: 'List przewozowy CMR' });
    await page.getByLabel('Tytuł').fill('CMR Łódź – Berlin');
    await page.getByLabel('Numer dokumentu (opcjonalnie)').fill('PL 555/2026');
    await page.getByRole('button', { name: 'Zrób zdjęcie' }).click();
    const preview = page.getByTestId('camera-preview');
    await expect
      .poll(() => preview.evaluate((video: HTMLVideoElement) => video.videoWidth))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Wykonaj zdjęcie' }).click();
    await page.getByRole('button', { name: 'Obróć o 90°' }).click();
    await page.getByRole('button', { name: 'Użyj zdjęcia' }).click();
    await expect(page.getByTestId('compression-info')).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz dokument' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('CMR Łódź – Berlin');
    await expect(page.getByRole('img', { name: /Podgląd dokumentu/ })).toBeVisible();
  });

  await test.step('add a new version (PDF)', async () => {
    await page.getByLabel('Nowy plik').setInputFiles({
      name: 'cmr-z-pieczatka.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n% CMR z pieczatka odbiorcy\n%%EOF\n'),
    });
    await page.getByLabel('Opis zmiany (opcjonalnie)').fill('Skan z pieczątką odbiorcy');
    await page.getByRole('button', { name: 'Wyślij nową wersję' }).click();
    await expect(page.getByTestId('versions').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('pdf-preview')).toBeVisible();
  });

  await test.step('submit the document and see the status in the list', async () => {
    await page.getByRole('button', { name: 'Oznacz jako: Przesłany' }).click();
    await expect(page.locator('.page-header .badge')).toHaveText('Przesłany');
    await expect(page.getByTestId('history')).toContainText('Status: Roboczy → Przesłany');
    await page.getByRole('link', { name: 'Dokumenty' }).click();
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Przesłany' });
    await expect(page.getByRole('link', { name: /CMR Łódź – Berlin/ })).toContainText('Przesłany');
    await page.getByRole('link', { name: /CMR Łódź – Berlin/ }).click();
  });

  await test.step('download both versions', async () => {
    const [v2] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Pobierz: Wersja 2' }).click(),
    ]);
    expect((await readFile(await v2.path())).toString()).toContain('pieczatka odbiorcy');
    const [v1] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Pobierz: Wersja 1' }).click(),
    ]);
    expect(v1.suggestedFilename()).toMatch(/-v1\.jpeg$/);
    const jpeg = await readFile(await v1.path());
    expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  await test.step('log out and log in again', async () => {
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page).toHaveURL('/logowanie');
    await page.getByLabel('Login').fill(username);
    await page.getByLabel('Hasło').fill(PASSWORD);
    await page.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect(page.getByRole('link', { name: /CMR Łódź – Berlin/ })).toBeVisible();
  });
});
