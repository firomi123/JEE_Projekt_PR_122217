import { expect, test } from '@playwright/test';
import {
  fillLogin,
  PASSWORD,
  registerThroughApi,
  registerThroughUi,
  uniqueUsername,
} from './helpers';

test.describe('registration', () => {
  test('registers, logs in automatically and shows the start page', async ({ page }) => {
    const username = await registerThroughUi(page);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Moje dokumenty' })).toBeVisible();
    await expect(page.getByText(`Witaj, ${username}!`)).toBeVisible();
  });

  test('shows validation errors next to the fields and sends nothing', async ({ page }) => {
    let registerCalls = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/register')) registerCalls++;
    });
    await page.goto('/rejestracja');

    await page.getByLabel('Login').fill('ab');
    await page.getByLabel('Adres e-mail').fill('to-nie-email');
    await page.getByLabel('Hasło', { exact: true }).fill('slabe');
    await page.getByLabel('Powtórz hasło').fill('inne');
    await page.getByRole('button', { name: 'Załóż konto' }).click();

    await expect(page.getByLabel('Login')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Login musi mieć co najmniej 3 znaki')).toBeVisible();
    await expect(page.getByText('Podaj poprawny adres e-mail')).toBeVisible();
    await expect(page.getByText('Hasło musi mieć co najmniej 8 znaków')).toBeVisible();
    await expect(page.getByText('Hasła nie są identyczne')).toBeVisible();
    expect(registerCalls).toBe(0);
  });

  test('shows the API error next to the username when it is taken', async ({ page }) => {
    const username = await registerThroughApi(page);
    await page.goto('/rejestracja');

    await page.getByLabel('Login').fill(username.toUpperCase());
    await page.getByLabel('Adres e-mail').fill(`inny_${username}@example.com`);
    await page.getByLabel('Hasło', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Powtórz hasło').fill(PASSWORD);
    await page.getByRole('button', { name: 'Załóż konto' }).click();

    await expect(page.getByText('Ten login jest już zajęty')).toBeVisible();
    await expect(page.getByLabel('Login')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/rejestracja');
  });
});

test.describe('login and logout', () => {
  test('logs in with correct credentials', async ({ page }) => {
    const username = await registerThroughApi(page);
    await page.goto('/logowanie');

    await fillLogin(page, username);

    await expect(page.getByTestId('current-user')).toHaveText(username);
  });

  test('shows a message for a wrong password and stays on the login page', async ({ page }) => {
    const username = await registerThroughApi(page);
    await page.goto('/logowanie');

    await fillLogin(page, username, 'Zle-haslo1!');

    await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy login lub hasło.');
    await expect(page).toHaveURL('/logowanie');
  });

  test('logs out and protects the pages again', async ({ page }) => {
    await registerThroughUi(page);

    await page.getByRole('button', { name: 'Wyloguj' }).click();

    await expect(page).toHaveURL('/logowanie');
    await page.goto('/');
    await expect(page).toHaveURL('/logowanie');
  });

  test('keeps the session after reloading the page', async ({ page }) => {
    const username = await registerThroughUi(page);

    await page.reload();

    await expect(page.getByTestId('current-user')).toHaveText(username);
  });

  test('sends a logged-out user to the login page and back to the requested page', async ({
    page,
  }) => {
    const username = await registerThroughApi(page);

    await page.goto('/profil?tab=dane');
    await expect(page).toHaveURL('/logowanie');
    await fillLogin(page, username);

    await expect(page).toHaveURL('/profil?tab=dane');
  });

  test('logs out with a message when the stored session is no longer valid', async ({ page }) => {
    await registerThroughUi(page);
    await page.evaluate(() => {
      const key = 'driver-docs.session';
      const session = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...session, token: 'uszkodzony.token.jwt' }));
    });

    await page.reload();

    await expect(page).toHaveURL('/logowanie');
    await expect(page.getByRole('status')).toHaveText('Sesja wygasła. Zaloguj się ponownie.');
  });
});

test.describe('mobile layout', () => {
  test('shows the main navigation as a bottom bar with large touch targets', async ({ page }) => {
    await registerThroughUi(page, uniqueUsername('nav'));
    const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });

    const box = await nav.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
    for (const link of await nav.getByRole('link').all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
