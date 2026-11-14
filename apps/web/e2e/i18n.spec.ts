import { expect, test } from './fixtures';
import { LOCALES, messages, NATIVE_NAMES, type Locale } from './support';

// Scenario 2: a supported browser language goes straight to Home in that language.
const DETECTION: ReadonlyArray<[browserLocale: string, expected: Locale]> = [
  ['en-US', 'en'],
  ['es-ES', 'es'],
  ['de-DE', 'de'],
  ['fi-FI', 'fi'],
  ['nb-NO', 'no'],
  ['pt-BR', 'pt'],
];

for (const [browserLocale, expected] of DETECTION) {
  test.describe(`browser language ${browserLocale}`, () => {
    test.use({ locale: browserLocale });

    test(`shows Home in ${expected} without redirect or cookie`, async ({ page, context }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe('/');
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages(expected).home.headline);
      await expect(page.getByTestId('home-cta-start')).toHaveText(messages(expected).home.cta);
      expect((await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')).toBeUndefined();
    });
  });
}

test.describe('unsupported browser language (ja)', () => {
  test.use({ locale: 'ja-JP' });

  test('shows Language Selection in English with English preselected', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/language$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages('en').language.title);
    const select = page.getByTestId('language-select');
    await expect(select).toHaveValue('en');
    await expect(select.locator('option')).toHaveText(NATIVE_NAMES);
  });

  test('choosing Deutsch persists the cookie and shows German Home, also after a reload', async ({ page, context }) => {
    await page.goto('/');
    await page.getByTestId('language-select').selectOption('de');
    await page.getByTestId('language-continue').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages('de').home.headline);

    const cookie = (await context.cookies()).find((c) => c.name === 'NEXT_LOCALE');
    expect(cookie).toMatchObject({ value: 'de', path: '/', sameSite: 'Lax' });
    const days = ((cookie?.expires ?? 0) - Date.now() / 1000) / 86400;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(366);

    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });
});

test.describe('in-app language selector', () => {
  test.use({ locale: 'en-US' });

  test('lists the 11 native names, marks the current one, switches to French and persists', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('locale-selector')).toHaveAccessibleName('Language: English');
    await page.getByTestId('locale-selector').click();
    const sheet = page.getByRole('dialog', { name: 'Language' });
    await expect(sheet).toBeVisible();
    const options = sheet.locator('[data-testid^="locale-option-"]');
    await expect(options).toHaveText(NATIVE_NAMES);
    await expect(sheet.locator('[aria-current="true"]')).toHaveText('English');

    await page.getByTestId('locale-option-fr').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages('fr').home.headline);
    await expect(sheet).toBeHidden();
    expect((await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value).toBe('fr');

    // The cookie wins over Accept-Language (en-US) on a fresh load.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByTestId('locale-selector')).toHaveAccessibleName('Langue : Français');
  });

  test('works with the keyboard: open, move, choose, Escape closes', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('locale-selector').focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Language' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.getByTestId('locale-selector').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('locale-option-de').focus();
    await expect(page.getByTestId('locale-option-de')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });
});

test('every locale renders its own Home via the cookie', async ({ page, context }) => {
  for (const locale of LOCALES) {
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: process.env.E2E_BASE_URL ?? 'http://localhost:3100' }]);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByTestId('professional-link')).toHaveText(messages(locale).home.professionalLink);
  }
});
