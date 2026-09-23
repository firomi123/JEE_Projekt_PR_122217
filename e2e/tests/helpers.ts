import { expect, type Page } from '@playwright/test';

/** Password used for every account created by the end-to-end tests. */
export const PASSWORD = 'Tajne123!';

/**
 * Generates a unique username, so tests can run in parallel on one database.
 *
 * @param prefix - Readable prefix (letters, digits, `_`).
 * @returns A lowercase username of at most 30 characters.
 */
export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    30,
  );
}

/**
 * Registers an account through the UI and waits until the app shows the logged-in
 * start page.
 *
 * @param page - Playwright page.
 * @param username - Username to register (default: unique).
 * @returns The username of the new, logged-in account.
 */
export async function registerThroughUi(page: Page, username = uniqueUsername()): Promise<string> {
  await page.goto('/rejestracja');
  await page.getByLabel('Login').fill(username);
  await page.getByLabel('Adres e-mail').fill(`${username}@example.com`);
  await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Powtórz hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Załóż konto' }).click();
  await expect(page.getByTestId('current-user')).toHaveText(username);
  return username;
}

/**
 * Registers an account through the API (faster than the UI) without logging in.
 *
 * @param page - Playwright page (its request context shares the base URL).
 * @param username - Username to register (default: unique).
 * @returns The username.
 */
export async function registerThroughApi(page: Page, username = uniqueUsername()): Promise<string> {
  const response = await page.request.post('/api/auth/register', {
    data: {
      username,
      email: `${username}@example.com`,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    },
  });
  expect(response.status()).toBe(201);
  return username;
}

/**
 * Logs in through the login form.
 *
 * @param page - Playwright page (must be on the login screen).
 * @param username - Username.
 * @param password - Password (default {@link PASSWORD}).
 */
export async function fillLogin(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Login').fill(username);
  await page.getByLabel('Hasło').fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

/**
 * Reads the access token of the logged-in user from the page's `localStorage`.
 *
 * @param page - Playwright page with a logged-in user.
 * @returns The Bearer token.
 */
export async function tokenOf(page: Page): Promise<string> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('driver-docs.session')!).token);
}

/**
 * Creates a document directly through the API as the logged-in user (faster than
 * the form when a test only needs existing documents).
 *
 * @param page - Playwright page with a logged-in user.
 * @param fields - Document type and title.
 * @returns The id of the created document.
 */
export async function createDocumentViaApi(
  page: Page,
  fields: { type: string; title: string; number?: string },
): Promise<string> {
  const token = await tokenOf(page);
  const response = await page.request.post('/api/documents', {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      ...fields,
      file: {
        name: 'dok.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(`%PDF-1.7\n${fields.title}\n%%EOF\n`),
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).document.id;
}
