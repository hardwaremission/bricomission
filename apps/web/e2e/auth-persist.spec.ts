import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { authOrigins, baseURL, completeKeycloakSignIn, guardLocalhost, HOMEOWNER, pageFetch } from './support';

// Scenario 3 (homeowner-password-login): the web session survives a web container restart.
// Driven by scripts/web/auth-persist-check.sh: phase `save` signs in and writes the storage
// state; the script restarts `web`; phase `check` reloads with that state. Skipped otherwise.
const PHASE = process.env.E2E_PERSIST_PHASE;
const STATE_FILE = 'test-results/auth-state.json';

test.skip(!PHASE, 'run through scripts/web/auth-persist-check.sh (E2E_PERSIST_PHASE=save|check)');

test('session persistence across a web restart', async ({ browser }) => {
  test.setTimeout(60_000);
  const WEB = new URL(baseURL()).origin;
  if (PHASE === 'save') {
    const context = await browser.newContext({ baseURL: baseURL() });
    const blocked = await guardLocalhost(context, authOrigins());
    const page = await context.newPage();
    await page.goto('/auth/login?returnTo=%2F');
    await completeKeycloakSignIn(page, context.request, '/');
    await expect(page.getByTestId('account-button')).toBeVisible();
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    await context.storageState({ path: STATE_FILE });
    expect(blocked).toEqual([]);
    await context.close();
    return;
  }
  expect(PHASE).toBe('check');
  expect(existsSync(STATE_FILE), `${STATE_FILE} from phase save`).toBe(true);
  const context = await browser.newContext({ baseURL: baseURL(), storageState: STATE_FILE });
  const blocked = await guardLocalhost(context, authOrigins());
  const page = await context.newPage();
  await page.goto(`${WEB}/`);
  await expect(page.getByTestId('account-button')).toBeVisible();
  const me = await pageFetch(page, '/api/me');
  expect(me.status).toBe(200);
  expect(JSON.parse(me.body)).toMatchObject({ username: HOMEOWNER });
  expect(blocked).toEqual([]);
  await context.close();
});
