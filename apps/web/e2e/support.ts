import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

export const LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi'] as const;
export type Locale = (typeof LOCALES)[number];
export const NATIVE_NAMES = ['English', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', 'Nederlands', 'Svenska', 'Norsk', 'Dansk', 'Suomi'];

interface Messages {
  home: { headline: string; cta: string; professionalLink: string };
  language: { title: string };
  status: Record<'checking' | 'online' | 'degraded' | 'offline', string>;
  auth: {
    signIn: string;
    accountLabel: string;
    sheetTitle: string;
    close: string;
    signOut: string;
    error: { title: string; reasons: Record<'cancelled' | 'expired' | 'unavailable' | 'generic', string>; tryAgain: string; backHome: string };
  };
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

/**
 * Horizontal overflow of the document and of every scroll container. Elements marked
 * `data-scroll-x` are designed horizontal scrollers (e.g. the Moodboard style chips) and skipped.
 */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const offenders: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth) offenders.push(`document ${doc.scrollWidth}>${window.innerWidth}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || !['auto', 'scroll'].includes(style.overflowX) || el.hasAttribute('data-scroll-x')) continue;
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

// --- Keycloak theme E2E (feature keycloak-login-theme) ---

export function keycloakURL(): string {
  return process.env.E2E_KEYCLOAK_URL ?? 'http://localhost:8180';
}

export function mailpitURL(): string {
  return process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
}

export function homeownerPassword(): string {
  return process.env.E2E_SEED_HOMEOWNER_PASSWORD ?? 'bm-homeowner-dev';
}

export const KC_REALM_PATH = '/realms/BricoMission';
export const DEV_CLIENT = 'bricomission-dev-cli';
export const DEV_REDIRECT = 'http://localhost/dev-callback';

export interface Pkce {
  verifier: string;
  challenge: string;
}

export function newPkce(): Pkce {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Authorization Code + PKCE URL of the dev client, with ui_locales and optional extra params. */
export function keycloakAuthUrl(locale: string, pkce: Pkce, extra: Record<string, string> = {}): string {
  const url = new URL(`${keycloakURL()}${KC_REALM_PATH}/protocol/openid-connect/auth`);
  const params = {
    client_id: DEV_CLIENT,
    redirect_uri: DEV_REDIRECT,
    response_type: 'code',
    scope: 'openid',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    ui_locales: locale,
    ...extra,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Localhost-only request guard: every browser request in the context must go to one of the
 * allowed origins; anything else is aborted and recorded (the caller asserts the list is empty).
 */
export async function guardLocalhost(context: BrowserContext, allowedOrigins: string[]): Promise<string[]> {
  const blocked: string[] = [];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || allowedOrigins.includes(new URL(url).origin)) return route.continue();
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  return blocked;
}

/** Messages of the Keycloak theme (login or email set), MessageFormat-unescaped. */
export function kcMessages(set: 'login' | 'email', locale: string): Record<string, string> {
  const file = fileURLToPath(new URL(`../../../infra/keycloak/themes/bricomission/${set}/messages/messages_${locale}.properties`, import.meta.url));
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    out[line.slice(0, eq)] = line.slice(eq + 1).replaceAll("''", "'");
  }
  return out;
}

/** Fills MessageFormat arguments {0}, {1}, ... */
export function fmt(message: string, ...args: Array<string | number>): string {
  return message.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)]));
}

export interface MailpitMessage {
  id: string;
  subject: string;
  text: string;
  html: string;
  code: string;
}

async function mailpitSearch(request: APIRequestContext, email: string) {
  const res = await request.get(`${mailpitURL()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  return ((await res.json()) as { messages: Array<{ ID: string }> }).messages;
}

/**
 * Deletes the Mailpit messages for `email`, runs `trigger`, then polls up to 15 s for the new
 * code email and parses its 6-digit code (the code is on its own line in the text part).
 */
export async function mailpitCode(request: APIRequestContext, email: string, trigger: () => Promise<unknown>): Promise<MailpitMessage> {
  await request.delete(`${mailpitURL()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  await trigger();
  for (let i = 0; i < 30; i++) {
    const [first] = await mailpitSearch(request, email);
    if (first) {
      const msg = (await (await request.get(`${mailpitURL()}/api/v1/message/${first.ID}`)).json()) as { ID: string; Subject: string; Text: string; HTML: string };
      const code = /^(\d{6})\s*$/m.exec(msg.Text)?.[1];
      if (!code) throw new Error(`Mailpit message ${msg.ID} has no 6-digit code line`);
      return { id: msg.ID, subject: msg.Subject, text: msg.Text, html: msg.HTML, code };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email to ${email} in Mailpit within 15 s`);
}

/** Number of Mailpit messages for `email` right now. */
export async function mailpitCount(request: APIRequestContext, email: string): Promise<number> {
  return (await mailpitSearch(request, email)).length;
}

export async function mailpitClear(request: APIRequestContext, email: string) {
  await request.delete(`${mailpitURL()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
}

// --- Web sign-in E2E (feature homeowner-password-login) ---

export const HOMEOWNER = 'bm-homeowner';
export const HOMEOWNER_EMAIL = 'homeowner@bricomission.local';
export const HOMEOWNER_DISPLAY_NAME = 'Hugo Homeowner';

/** Origins the auth E2E may reach: the web app and Keycloak (both on localhost). */
export function authOrigins(): string[] {
  return [new URL(baseURL()).origin, new URL(keycloakURL()).origin];
}

/**
 * On the themed Keycloak sign-in page: enters the password, reads the email code from Mailpit,
 * submits it and waits until the browser is back on the web app at `landingPath`.
 */
export async function completeKeycloakSignIn(page: Page, request: APIRequestContext, landingPath = '/', username = HOMEOWNER, password = homeownerPassword(), email = HOMEOWNER_EMAIL) {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  const mail = await mailpitCode(request, email, () => page.locator('#kc-login').click());
  await page.locator('#emailCode').fill(mail.code);
  await page.locator('#kc-login').click();
  await page.waitForURL(`${new URL(baseURL()).origin}${landingPath}`);
  return mail;
}

/** Calls the same-origin API proxy from the page (as the app would) and returns status and body. */
export async function pageFetch(page: Page, path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, { ...init, credentials: 'same-origin' });
      return { status: res.status, body: await res.text() };
    },
    { path, init },
  );
}
