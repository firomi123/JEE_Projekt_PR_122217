import { devices, type APIRequestContext, type Page } from '@playwright/test';
import { e2eOffice } from '../env';
import { expect, test } from './fixtures';
import { fillLogin, PASSWORD, searchAndChooseStatusAtOnce, uniqueUsername } from './helpers';

/** A driver prepared through the API, with one submitted document. */
interface PreparedDriver {
  username: string;
  token: string;
  documentId: string;
  title: string;
}

/**
 * Registers a driver, fills in his name and uploads and submits one PDF document,
 * all through the API (the office tests start where the driver's part ends).
 *
 * @param request - Playwright API client (shares the base URL).
 * @param title - Title of the document.
 * @returns The driver's login, token and the submitted document.
 */
async function driverWithSubmittedDocument(
  request: APIRequestContext,
  title: string,
): Promise<PreparedDriver> {
  const username = uniqueUsername('kier');
  await request.post('/api/auth/register', {
    data: {
      username,
      email: `${username}@example.com`,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
  const login = await request.post('/api/auth/login', { data: { username, password: PASSWORD } });
  const token = (await login.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };
  await request.put('/api/profile', {
    headers,
    data: { firstName: 'Marek', lastName: 'Zieliński', companyName: 'Trans-Pol' },
  });
  const created = await request.post('/api/documents', {
    headers,
    multipart: {
      type: 'CMR',
      title,
      number: 'PL 777/2026',
      file: {
        name: 'cmr.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(`%PDF-1.7\n${title}\n%%EOF\n`),
      },
    },
  });
  expect(created.status()).toBe(201);
  const documentId = (await created.json()).document.id as string;
  const submitted = await request.patch(`/api/documents/${documentId}`, {
    headers,
    data: { status: 'SUBMITTED' },
  });
  expect(submitted.status()).toBe(200);
  return { username, token, documentId, title };
}

/**
 * Logs in as the office account through the login form.
 *
 * @param page - Playwright page.
 */
async function loginAsOffice(page: Page): Promise<void> {
  await page.goto('/logowanie');
  await fillLogin(page, e2eOffice.username, e2eOffice.password);
  await expect(page).toHaveURL(/\/biuro$/);
}

test.describe('office panel in a desktop browser', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent: devices['Desktop Chrome'].userAgent,
  });

  test('the office sees submitted documents of all drivers and filters by driver', async ({
    page,
  }) => {
    const first = await driverWithSubmittedDocument(page.request, `CMR biuro A ${Date.now()}`);
    const second = await driverWithSubmittedDocument(page.request, `CMR biuro B ${Date.now()}`);

    await loginAsOffice(page);

    await expect(page.getByRole('heading', { name: 'Dokumenty do sprawdzenia' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Kierowca' })).toBeVisible();
    const rowOfFirst = page.getByTestId('office-row').filter({ hasText: first.title });
    await expect(rowOfFirst).toContainText(`Marek Zieliński (${first.username})`);
    await expect(rowOfFirst).toContainText('Przesłany');

    await page
      .getByLabel('Kierowca')
      .selectOption({ label: `Marek Zieliński (${second.username})` });
    await expect(page).toHaveURL(/driverId=/);
    await expect(page.getByTestId('office-row')).toHaveCount(1);
    await expect(page.getByTestId('office-row')).toContainText(second.title);
  });

  test('keeps a filter chosen while the search text is still being applied', async ({ page }) => {
    await loginAsOffice(page);
    await page.getByRole('link', { name: 'Wszystkie dokumenty' }).click();

    await searchAndChooseStatusAtOnce(page, 'nieistniejący', 'ACCEPTED');

    await expect(page).toHaveURL(/q=nieistniej/);
    await expect(page).toHaveURL(/status=ACCEPTED/);
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('ACCEPTED');
  });

  test('reject with a reason → the driver corrects and resubmits → the office accepts', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const driver = await driverWithSubmittedDocument(page.request, `CMR do oceny ${Date.now()}`);

    await test.step('the office opens the document and must give a reason to reject it', async () => {
      await loginAsOffice(page);
      await page.getByRole('link', { name: `Otwórz dokument ${driver.title}` }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(driver.title);
      await expect(page.getByTestId('pdf-preview')).toBeVisible();
      await expect(page.getByText(`Marek Zieliński (${driver.username})`)).toBeVisible();

      await page.getByRole('button', { name: 'Odrzuć' }).click();
      await expect(page.getByText('Podaj powód odrzucenia')).toBeVisible();

      await page.getByLabel('Komentarz dla kierowcy').fill('Brak pieczątki odbiorcy');
      await page.getByRole('button', { name: 'Odrzuć' }).click();
      await expect(page.getByText('Zapisano decyzję: Odrzucony.')).toBeVisible();
      await expect(page.locator('.page-header .badge')).toHaveText('Odrzucony');
      await expect(page.getByTestId('history')).toContainText('„Brak pieczątki odbiorcy”');
    });

    await test.step('the driver sees the reason on his phone and resubmits', async () => {
      const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'pl-PL' });
      const driverPage = await phone.newPage();
      await driverPage.goto('/logowanie');
      await fillLogin(driverPage, driver.username);
      await driverPage.getByRole('link', { name: new RegExp(driver.title) }).click();

      await expect(driverPage.getByTestId('rejection')).toContainText(
        'Powód: Brak pieczątki odbiorcy',
      );
      await expect(driverPage.getByTestId('history')).toContainText('biuro: ');
      driverPage.on('dialog', (dialog) => dialog.accept());
      await driverPage.getByRole('button', { name: 'Oznacz jako: Przesłany' }).click();
      await expect(driverPage.locator('.page-header .badge')).toHaveText('Przesłany');
      await phone.close();
    });

    await test.step('the office accepts the corrected document', async () => {
      await page.getByRole('link', { name: '← Wróć do listy' }).click();
      await page.getByRole('link', { name: `Otwórz dokument ${driver.title}` }).click();
      await page.getByRole('button', { name: 'Akceptuj' }).click();
      await expect(page.getByText('Zapisano decyzję: Zaakceptowany.')).toBeVisible();
      await expect(page.locator('.page-header .badge')).toHaveText('Zaakceptowany');
      await expect(
        page.getByText('Decyzję podejmuje się tylko dla przesłanych dokumentów.'),
      ).toBeVisible();
    });
  });
});

test('keeps drivers and the office in their own parts of the application', async ({ page }) => {
  const driver = await driverWithSubmittedDocument(page.request, `CMR role ${Date.now()}`);

  await page.goto('/logowanie');
  await fillLogin(page, driver.username);
  await expect(page.getByRole('heading', { name: 'Moje dokumenty' })).toBeVisible();
  await page.goto('/biuro');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Moje dokumenty' })).toBeVisible();

  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await fillLogin(page, e2eOffice.username, e2eOffice.password);
  await expect(page).toHaveURL(/\/biuro$/);
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/biuro$/);
});
