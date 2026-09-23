import { expect, test, type Page } from '@playwright/test';
import { disguisedExe, pdfFile, pngFile } from './files';
import { createDocumentViaApi, registerThroughUi } from './helpers';

const FILE_LABEL = 'Plik (JPG, PNG lub PDF, maks. 10 MB)';

/**
 * Fills and submits the "new document" form.
 *
 * @param page - Page on `/dokumenty/nowy`.
 * @param fields - Type label, title, optional number and the file.
 */
async function submitNewDocument(
  page: Page,
  fields: {
    type?: string;
    title: string;
    number?: string;
    file: Parameters<Page['setInputFiles']>[1];
  },
) {
  if (fields.type) await page.getByLabel('Typ dokumentu').selectOption({ label: fields.type });
  await page.getByLabel('Tytuł').fill(fields.title);
  if (fields.number) await page.getByLabel('Numer dokumentu (opcjonalnie)').fill(fields.number);
  await page.getByLabel(FILE_LABEL).setInputFiles(fields.file);
  await page.getByRole('button', { name: 'Zapisz dokument' }).click();
}

test.beforeEach(async ({ page }) => {
  // Status changes and deletion ask for confirmation.
  page.on('dialog', (dialog) => dialog.accept());
  await registerThroughUi(page);
});

test('adds a document from a file and shows it in the list and in the preview', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Dodaj', exact: true }).click();
  await submitNewDocument(page, {
    type: 'Wydanie zewnętrzne (WZ)',
    title: 'WZ magazyn Łódź',
    number: 'WZ/123/2026',
    file: pngFile(),
  });

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('WZ magazyn Łódź');
  await expect(page.getByRole('img', { name: 'Podgląd dokumentu WZ magazyn Łódź' })).toBeVisible();
  const preview = page.getByRole('img', { name: 'Podgląd dokumentu WZ magazyn Łódź' });
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await page.getByRole('link', { name: 'Dokumenty' }).click();
  const card = page.getByRole('link', { name: /WZ magazyn Łódź/ });
  await expect(card).toContainText('Roboczy');
  await expect(card).toContainText('WZ/123/2026');
});

test('loads the documents right after a page reload (token restored before the first request)', async ({
  page,
}) => {
  const id = await createDocumentViaApi(page, { type: 'CMR', title: 'Po odświeżeniu' });

  await page.reload();
  await expect(page.getByRole('link', { name: /Po odświeżeniu/ })).toBeVisible();

  await page.goto(`/dokumenty/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Po odświeżeniu');
  await expect(page.getByText('Sesja wygasła')).toHaveCount(0);
});

test('shows the server rejection of a disguised file next to the file field', async ({ page }) => {
  await page.goto('/dokumenty/nowy');

  await submitNewDocument(page, { title: 'Podejrzany plik', file: disguisedExe() });

  await expect(page.getByText('Dozwolone są tylko pliki JPG, PNG i PDF')).toBeVisible();
  await expect(page).toHaveURL('/dokumenty/nowy');
});

test('filters the list by type and status and searches by text', async ({ page }) => {
  await createDocumentViaApi(page, { type: 'CMR', title: 'CMR Berlin' });
  await createDocumentViaApi(page, { type: 'WZ', title: 'WZ Poznań' });
  await createDocumentViaApi(page, { type: 'INVOICE', title: 'Faktura paliwo', number: 'FV/9' });
  await page.reload();

  await page.getByLabel('Typ', { exact: true }).selectOption({ label: 'Wydanie zewnętrzne (WZ)' });
  await expect(page).toHaveURL(/type=WZ/);
  await expect(page.locator('.document-card')).toHaveCount(1);
  await expect(page.locator('.document-card')).toContainText('WZ Poznań');

  await page.getByLabel('Typ', { exact: true }).selectOption({ label: 'Wszystkie' });
  await page.getByLabel('Szukaj (tytuł lub numer)').fill('fv/9');
  await expect(page.locator('.document-card')).toHaveCount(1);
  await expect(page.locator('.document-card')).toContainText('Faktura paliwo');

  await page.getByLabel('Szukaj (tytuł lub numer)').fill('');
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Przesłany' });
  await expect(page.getByText('Brak dokumentów spełniających kryteria.')).toBeVisible();
});

test('adds a new version: two versions and the history entry are shown', async ({ page }) => {
  const id = await createDocumentViaApi(page, { type: 'CMR', title: 'CMR z pieczątką' });
  await page.goto(`/dokumenty/${id}`);

  await page.getByLabel('Nowy plik').setInputFiles(pngFile('z-pieczatka.png'));
  await page.getByLabel('Opis zmiany (opcjonalnie)').fill('Skan z pieczątką odbiorcy');
  await page.getByRole('button', { name: 'Wyślij nową wersję' }).click();

  const versions = page.getByTestId('versions').getByRole('listitem');
  await expect(versions).toHaveCount(2);
  await expect(versions.first()).toContainText('Wersja 2');
  await expect(versions.first()).toContainText('Skan z pieczątką odbiorcy');
  await expect(page.getByTestId('history')).toContainText('Dodano wersję 2');
  await expect(page.getByRole('img', { name: /Podgląd dokumentu/ })).toBeVisible();
});

test('changes the status; the new status is visible in the list', async ({ page }) => {
  const id = await createDocumentViaApi(page, { type: 'CMR', title: 'Do przesłania' });
  await page.goto(`/dokumenty/${id}`);

  await page.getByRole('button', { name: 'Oznacz jako: Przesłany' }).click();

  await expect(page.locator('.page-header .badge')).toHaveText('Przesłany');
  await expect(page.getByTestId('history')).toContainText('Status: Roboczy → Przesłany');
  await expect(page.getByRole('button', { name: 'Oznacz jako: Zaakceptowany' })).toBeVisible();
  await page.getByRole('link', { name: 'Dokumenty' }).click();
  await expect(page.getByRole('link', { name: /Do przesłania/ })).toContainText('Przesłany');
});

test('edits the title and number', async ({ page }) => {
  const id = await createDocumentViaApi(page, { type: 'CMR', title: 'Stary tytuł' });
  await page.goto(`/dokumenty/${id}`);

  await page.getByLabel('Tytuł', { exact: true }).fill('Nowy tytuł');
  await page.getByLabel('Numer', { exact: true }).fill('CMR-77');
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nowy tytuł');
  await expect(page.getByTestId('history')).toContainText(
    'Zmieniono tytuł: „Stary tytuł” → „Nowy tytuł”',
  );
});

test('downloads a version with the original content', async ({ page }) => {
  await page.goto('/dokumenty/nowy');
  const file = pdfFile('cmr-oryginal.pdf');
  await submitNewDocument(page, { title: 'CMR do pobrania', file });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CMR do pobrania');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Pobierz: Wersja 1' }).click(),
  ]);

  expect(download.suggestedFilename()).toBe('CMR do pobrania-v1.pdf');
  const path = await download.path();
  const { readFile } = await import('node:fs/promises');
  expect((await readFile(path)).equals(file.buffer)).toBe(true);
});

test('deletes a document after confirmation', async ({ page }) => {
  const id = await createDocumentViaApi(page, { type: 'OTHER', title: 'Do usunięcia' });
  await page.goto(`/dokumenty/${id}`);

  await page.getByRole('button', { name: 'Usuń dokument' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText('Nie masz jeszcze żadnych dokumentów.')).toBeVisible();
});

test.describe('profile', () => {
  test('saves the profile; values are normalized and survive a reload', async ({ page }) => {
    await page.getByRole('link', { name: 'Profil' }).click();

    await page.getByLabel('Imię').fill('Łukasz');
    await page.getByLabel('Nazwisko').fill('Wiśniewski');
    await page.getByLabel('Telefon').fill('+48 601 234 567');
    await page.getByLabel('Numer prawa jazdy').fill('00123/15/1465');
    await page.getByLabel('Firma przewozowa').fill('Trans-Pol');
    await page.getByRole('button', { name: 'Zapisz profil' }).click();

    await expect(page.getByRole('status')).toHaveText('Profil zapisany.');
    await page.reload();
    await expect(page.getByLabel('Imię')).toHaveValue('Łukasz');
    await expect(page.getByLabel('Telefon')).toHaveValue('+48601234567');
  });

  test('shows validation errors next to the fields', async ({ page }) => {
    await page.goto('/profil');

    await page.getByLabel('Imię').fill('J4n');
    await page.getByLabel('Telefon').fill('abc');
    await page.getByRole('button', { name: 'Zapisz profil' }).click();

    await expect(
      page.getByText('Imię może zawierać tylko litery, spację, myślnik i apostrof'),
    ).toBeVisible();
    await expect(
      page.getByText('Podaj poprawny numer telefonu (9–15 cyfr, opcjonalnie +)'),
    ).toBeVisible();
  });
});
