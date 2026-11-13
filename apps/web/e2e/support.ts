import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';

export const LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi'] as const;
export type Locale = (typeof LOCALES)[number];
export const NATIVE_NAMES = ['English', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', 'Nederlands', 'Svenska', 'Norsk', 'Dansk', 'Suomi'];

interface Messages {
  home: { headline: string; cta: string; professionalLink: string };
  language: { title: string };
  status: Record<'checking' | 'online' | 'degraded' | 'offline', string>;
}

export function messages(locale: Locale): Messages {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url)), 'utf8')) as Messages;
}

export function baseURL(): string {
  return process.env.E2E_BASE_URL ?? 'http://localhost:3100';
}

export async function setLocaleCookie(context: BrowserContext, locale: Locale) {
  await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL(), sameSite: 'Lax' }]);
}

/** Horizontal overflow of the document and of every scroll container. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth) offenders.push(`document ${doc.scrollWidth}>${window.innerWidth}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || !['auto', 'scroll'].includes(style.overflowX)) continue;
      if (el.scrollWidth > el.clientWidth + 1) offenders.push(`${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return offenders;
  });
}

/** Visible interactive elements smaller than 44x44 CSS px. */
export async function smallTargets(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('a[href], button, select, input, [role="button"]'))
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ el, box }) => `${el.tagName.toLowerCase()}[${el.dataset.testid ?? el.textContent?.trim()}] ${box.width}x${box.height}`),
  );
}
