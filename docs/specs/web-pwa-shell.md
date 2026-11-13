# Feature Implementation Spec: Installable PWA shell with design tokens and 11-locale i18n

## Source Feature

- `id`: web-pwa-shell
- `area`: frontend
- `depends_on`: api-skeleton (accepted)
- `status`: not_started (re-planned 2026-11-13 against the full PRD)
- `source`: `feature_list.json`

## Goal

Bootstrap `apps/web`, a Next.js (App Router) + Tailwind PWA built on the DESIGN.md tokens and run as a compose service. It is multi-language from day one, as PRD §3 "Internationalization" and "Phase 0: App Launch & Language Detection" require:

- All 11 MVP locales: en, es, fr, de, it, pt, nl, sv, no, da, fi. English is canonical.
- On first launch the app detects the browser language. A supported language goes straight to Home in that language. An unsupported language shows the conditional Language Selection screen (wireframe 1), with a dropdown that preselects English.
- A compact in-app language selector lists the 11 languages by native name. The choice persists on the device in a cookie.

Home targets the anonymous Homeowner (lazy login: no forced sign-in). Its one primary action starts a Kitchen Project. A discreet status element shows API health, read through a typed client generated from the API's OpenAPI document. The app is installable (manifest + service worker), makes no internet requests, and gets the repo's first persistent browser E2E harness (Playwright at 390x844) plus a Lighthouse installability check.

UI gate: the screens are designed in OpenPencil first, in English only. The implementer builds strictly from the approved design, read back through the `open-pencil` MCP. Translations come from the message files, not from the designs.

## Non-Goals

- Saving the language on the user account. PRD Phase 3 and §3 i18n ask for persistence in the database, but that needs login, so it moved to `language-preference-account` (formerly `i18n-all-locales`).
- Login, Keycloak OIDC, a Sign in control, tokens (`homeowner-password-login`).
- Any page behind the CTA. `kitchen-capture-draft` owns `/kitchen-projects/new`.
- Professional registration itself (`professional-registration`). This feature only renders the tertiary "Are you a professional?" link (see Decisions); its target is a 404 until then.
- Locale-prefixed URLs, locale-aware SEO, RTL, any locale beyond the 11.
- B2B/Admin layouts, push notifications, background sync, offline data, SSE usage, CORS on the API.
- A custom 404, an offline page, or any screen not in the approved design.

## Decisions (developer to confirm)

1. **Professionals on Home (developer decision 2026-11-13):** rendered now as a tertiary text link "Are you a professional?" linking to `/professionals/register`, visually quieter than everything else; Home keeps one primary action for the Homeowner. The target page is built by `professional-registration`; until then the link leads to a 404 (accepted, like the CTA).
2. **Translations (developer decision 2026-11-13):** the implementer writes the 10 non-English message files by agent translation, with no native or manual review. Acceptance relies on the automated parity test (same keys as English, no empty values, same ICU placeholders).
3. **Norwegian:** `no` means Bokmål. `nb`, `nn` and `no` browser tags all map to `no`. `pt-BR` and `pt-PT` map to `pt`.
4. **Device persistence:** only an explicit choice (Language Selection or the selector) writes the cookie. Detection alone writes nothing, so a later browser-language change is still followed until the user chooses.
5. **Language Selection** lives on its own route `/language`. It is shown only when there is no valid cookie and no supported browser language. Visitors can also open it directly.

## Job Story

When I open BricoMission on my phone for the first time,
I want it to appear in my language, or to let me pick one if my language is not supported,
so I can understand how to start my Kitchen Project without signing up.

## Users And Permissions

- Anonymous visitor: Home, Language Selection, selector. No account or token. `/health` is `@Public()`.
- The web proxy forwards to the API only. It adds no credentials and forwards no cookies.
- Agents: no `sudo`. Browsers come from a pinned Playwright Docker image.

## Acceptance Scenarios

Ports use the run's env (example: `WEB_PORT=3100`).

### Scenario 1: Web service runs in compose
Given `docker compose up -d --build --wait`
Then the 6 core services are healthy (postgres, minio, mailpit, keycloak, api, web). `web` listens only on `127.0.0.1:${WEB_PORT:-3100}` and runs as `node`, and `GET /` with a supported `Accept-Language` returns 200 HTML.

### Scenario 2: Supported browser language goes straight to Home
Given no `NEXT_LOCALE` cookie
When `/` is opened with `Accept-Language` `de-DE,de;q=0.9` (also `es`, `en-US`, `fi`, `nb-NO`, `pt-BR`)
Then Home renders in that locale (`de`, `es`, `en`, `fi`, `no`, `pt`) with matching `<html lang>`, with no redirect.
Resolution order: valid cookie, then the highest-q supported primary subtag (with the mappings above), else unsupported. `*` counts as unsupported.

### Scenario 3: Unsupported language shows Language Selection
Given no cookie and `Accept-Language: ja-JP,ja;q=0.9` (or empty)
When `/` is opened
Then the server redirects (307) to `/language`. That page renders in English with a dropdown listing the 11 languages by native name, English preselected. Choosing Deutsch and confirming sets `NEXT_LOCALE=de` (path `/`, 1 year, `SameSite=Lax`) and lands on German Home. A reload stays German and does not show `/language` again.

### Scenario 4: In-app language selector
Given Home in any locale
When the visitor opens the selector and picks Français
Then Home re-renders in French and the cookie becomes `fr`. The cookie wins over `Accept-Language`. The selector lists exactly the 11 native names, marks the current one, and works with keyboard and screen reader.

### Scenario 5: Message completeness
Given `apps/web/messages/*.json`
Then there are exactly 11 files. Each has exactly the key set of `en.json`, no empty string values, and the same ICU placeholders per key (unit test).

### Scenario 6: API health through the generated client
When Home loads
Then the browser calls `GET /api/health` (same origin) through `@bricomission/api-client` (`openapi-fetch` + generated `paths`). The status element shows:
- `online` when the API answers 200;
- `degraded` on 503 `database: down`;
- `offline` on a network error, a 5 s timeout or a proxy 502.
Each state has a localized label and no raw JSON, codes or error text.

### Scenario 7: Installable PWA
At `http://localhost:$WEB_PORT/`:
- `/manifest.webmanifest` has `name`, `short_name`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `theme_color` and `background_color`.
- Its PNG icons are 192, 512 and 512 `purpose: "maskable"`.
- `/sw.js` controls the page after one reload, and CDP `Page.getInstallabilityErrors` returns `[]`.
- Lighthouse `installable-manifest` passes.

### Scenario 8: Offline after first visit
Given the page was reloaded once under service worker control
When the context goes offline and reloads
Then the cached Home renders (in the locale it was cached in) and the status shows `offline`.

### Scenario 9: No external requests; mobile layout
- Every request goes to the page origin. Inter is self-hosted with the latin + latin-ext glyphs that cover å ä ö ø æ ß é ç ñ.
- At 390x844 and 360x780, Home in all 11 locales and `/language` show no horizontal overflow (`scrollWidth <= innerWidth`).
- The primary CTA is visible without scrolling.
- Interactive targets are at least 44x44 px.

### Scenario 10: Gates
`pnpm install --frozen-lockfile`, `pnpm -r lint` and `pnpm -r test` pass with no Docker and no browser. `./init.sh` exits 0 with its Web step. `pnpm test:e2e` passes against the stack.

## Repository Research

### Files Inspected

- `Documentación del Proyecto_BricoMission.md`:
  - §1.2: minimalist Apple/IKEA design, lazy login.
  - §3: i18n bullet (11 languages, detect, persist in DB); UI/UX design system; Wireframes Scope (screen 1, conditional Language Selection); Phase 0 (language detection); Phase 1 (lazy login); Phase 3 Registration Gate (B2B registration at the gate).
  - Line 502 still names `i18n-all-locales` (the orchestrator updates it; planner may not).
- `CONTEXT.md` (Kitchen Project, Login Gate), `docs/build-brief.md` (i18n plumbing in phase 1, locales originally "breadth"), `docs/user-and-access-model.md` (Anonymous visitor opens the PWA; Professional self-registers).
- `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DESIGN.md`, `docs/technical-discovery.md`, `docs/adr/0003-*`.
- `feature_list.json`: this entry, `i18n-all-locales` (now `language-preference-account`), `professional-registration`. No other feature depended on `i18n-all-locales`.
- `compose.yaml`, `.env.example`, `init.sh`, `apps/api/Dockerfile`, `apps/api/package.json`, root `package.json`, `pnpm-workspace.yaml`, `eslint.config.mjs`, `.dockerignore`, `docs/specs/api-skeleton.md`.
- Not present: `apps/web`, `packages/api-client`, `design/`, `docs/design/`. Package versions were not checked against registries (no network in planning).

### Existing Patterns To Follow

- Exact versions; pnpm 10.34.9; `node:26.13.1-bookworm-slim`; `npm install -g pnpm@10.34.9` in images.
- Compose conventions: `${VAR:-default}` = `.env.example`; `127.0.0.1:${X_PORT:-n}:n`; healthcheck 5s/5s/20; `restart: unless-stopped`; non-root.
- `lint` = ESLint + `tsc --noEmit`; `test` = Vitest, offline. `init.sh`: announced steps; failures exit 1 with `docker compose logs --tail 50 <svc>`; never foreground. Read ports with `awk -F: '{print $NF}'`.

### Current Gaps

- No web app, no client package, no E2E harness, no host browsers (`playwright install-deps` needs sudo and supports Debian/Ubuntu only).
- The api Dockerfile copies only the api and shared-types manifests (see Risks).
- Lighthouse 12+ dropped the PWA category and `installable-manifest`.

## Technical Approach

**Design input (blocking).** Before coding, read the approved read-back artifact from the orchestrator (expected `docs/design/web-pwa-shell.md`, or a JSON export under `design/`). If it is missing or not marked approved, stop and set `blocked`. Build layout, sizes, spacing, states and English copy from it.
- Values that match DESIGN.md tokens map to Tailwind tokens.
- Non-token values are implemented as designed and listed in Implementation Notes.
- Nothing is invented. The English copy in the design becomes `en.json`; the other 10 files translate it.

**apps/web (`@bricomission/web`).** Next.js App Router (newest stable exact version) with React 19.x and Tailwind CSS v4 (`@tailwindcss/postcss`).
- `src/app/`: `layout.tsx` (`<html lang>` from the resolved locale; `viewport` export with `themeColor`), `page.tsx` (Home), `language/page.tsx`, `manifest.ts`, `api/[...path]/route.ts`.
- `next.config.ts`: `output: 'standalone'`, `outputFileTracingRoot` = repo root, `transpilePackages: ['@bricomission/api-client']`, `poweredByHeader: false`, `cache-control: no-cache` header on `/sw.js`.
- Set `NEXT_TELEMETRY_DISABLED=1`.
- Scripts: `dev`, `build`, `start`, `lint`, `test` (Vitest), `test:e2e`.

**Tokens and font.** `src/app/globals.css` contains `@import "tailwindcss"` and an `@theme` block mirroring every DESIGN.md token:
- `--color-*`, `--font-sans`, `--radius-sm|md|lg|pill`, `--shadow-card|sheet`, `--spacing-xs..xxl`;
- text sizes for display, h1, h2, body and small.
A Vitest test checks that every DESIGN.md color hex equals its CSS variable (regex over the front matter). The font is `@fontsource-variable/inter` (exact version, OFL, latin + latin-ext), imported locally. Never `next/font/google`.

**i18n.**
- `next-intl` (exact version) in "without i18n routing" mode, so there is no locale in the URL.
- `src/i18n/locales.ts` exports:
  - `LOCALES = ['en','es','fr','de','it','pt','nl','sv','no','da','fi'] as const` and `DEFAULT_LOCALE = 'en'`;
  - `LOCALE_NATIVE_NAMES`: English, Español, Français, Deutsch, Italiano, Português, Nederlands, Svenska, Norsk, Dansk, Suomi. These names are constants, not translated;
  - a pure `resolveLocale(cookie, acceptLanguage): Locale | null` that parses q-values, takes primary subtags, maps `nb`/`nn` to `no`, and ignores `*`.
- `src/i18n/request.ts` calls `resolveLocale` and falls back to `en` for rendering.
- `/` (server) redirects to `/language` when the result is `null`.
- `/language` always renders English. It shows a dropdown (English preselected) and a confirm action. A server action or route handler sets the cookie and redirects to `/`, and it validates that the value is in `LOCALES` (400 otherwise).
- The selector is a client component. It calls the same cookie setter, then `router.refresh()`.
- Messages live in `apps/web/messages/<locale>.json`, with namespaces `home`, `language`, `status`, `meta`.
- Tests: `resolveLocale` cases; key parity, empty values and placeholder parity across the 11 files; the native-name list equals `LOCALES`.
- If `next-intl` does not support the chosen Next major, use a minimal in-house provider with the same layout and record the deviation.
- AGENTS.md gets the rule that every UI string is added to all 11 files.

**Generated API client (`packages/api-client`).**
- `openapi.json` is a committed snapshot. `apps/api/test/openapi-snapshot.spec.ts` builds the app like the HTTP tests (`PrismaService` overridden, default env, no debug routes) and runs `SwaggerModule.createDocument`. With `UPDATE_OPENAPI_SNAPSHOT=1` it writes the snapshot (2-space JSON plus a newline); otherwise it deep-equals and fails on drift. Script: `apps/api` `openapi:export`.
- `src/schema.ts` is committed `openapi-typescript` output (exact version), script `generate`. A Vitest test fails if it is stale.
- `src/index.ts` exports `createApiClient(baseUrl)` (`openapi-fetch`, exact version).

**Same-origin proxy (no CORS).** The browser calls `/api/*`. A route handler forwards to `API_INTERNAL_URL` (runtime env; compose `http://api:3000`; dev default `http://127.0.0.1:3000`). It is a route handler and not `rewrites` because rewrites are baked into standalone output at build time. There is no CORS: no per-worktree origins, first-party cookies, one origin for the service worker and future auth. iOS calls the API directly. Rules:
- The target is the fixed base plus encoded path segments plus the original query; `.` or `..` segments give 400. It is never an open proxy.
- Forward the method, the streamed body (`duplex: 'half'`), and only these headers: `accept`, `accept-language`, `authorization`, `content-type`, `last-event-id`. No cookies.
- Return the upstream status, `content-type`, `cache-control` and `www-authenticate`, with a streamed body. Default to `cache-control: no-store`.
- If upstream is unreachable, return 502 `{"status":"error"}` and log the error class name only. Use `dynamic = 'force-dynamic'`.

**Home behavior.** Static content is a server component. The client component `ApiStatus` calls `client.GET('/health')` with `AbortSignal.timeout(5000)` on mount and on the `online` event. It sets `data-testid="api-status"` and `data-state` to `checking|online|degraded|offline`, with a text label in an `aria-live="polite"` region (never color alone). Test ids:
- CTA `home-cta-start`, a link to `/kitchen-projects/new` (a 404 until `kitchen-capture-draft`);
- selector `locale-selector`;
- Language Selection: `language-select` and `language-continue`.
The professional link has `data-testid="professional-link"` and points to `/professionals/register`.

**PWA.**
- `manifest.ts`: name and short_name `BricoMission`; theme and background colors from the design (DESIGN.md defaults `#1F4E79` and `#FAFAF8`); `lang: 'en'`.
- Icons in `public/icons/`: 192, 512, maskable 512, and an apple-touch icon at 180. They come from the design's icon frame, exported by MCP if supported, otherwise rendered from the read-back SVG by `apps/web/scripts/render-icons.ts` with Playwright's Chromium. Commit the PNGs.
- `public/sw.js` is hand-written with a versioned cache:
  - install precaches the manifest and icons only (`/` is not precached: it can redirect by locale);
  - navigations are network-first; successful 200 non-redirected responses are stored; on failure the cached copy is served (`ignoreVary: true`);
  - `/_next/static/*`, fonts and icons are cache-first;
  - `/api/*` and non-GET requests get no `respondWith`;
  - activate cleans old caches and calls `clients.claim()`.
- Registration happens in production builds only.

**Container and compose.**
- `apps/web/Dockerfile`, build context = repo root:
  - build stage: base `node:26.13.1-bookworm-slim` with pnpm 10.34.9; copy the manifests of root, `apps/web`, `packages/api-client` and `packages/shared-types`; run `pnpm install --frozen-lockfile --filter @bricomission/web...`; copy the sources; run `pnpm --filter @bricomission/web build`.
  - runtime stage: `.next/standalone`, `.next/static` and `public`; user `node`; `HOSTNAME=0.0.0.0`; `PORT=3000`; `CMD ["node","apps/web/server.js"]`.
- Compose `web`:
  - env `API_INTERNAL_URL: http://api:3000`;
  - port `"127.0.0.1:${WEB_PORT:-3100}:3000"`;
  - healthcheck: node `fetch` of `/manifest.webmanifest`, start_period 20s;
  - no `depends_on`.
- `.env.example`: `WEB_PORT=3100`.
- `.dockerignore`: `**/.next`, `**/test-results`, `**/playwright-report`.
- `.gitignore`: `.next/`, `next-env.d.ts`, `test-results/`, `playwright-report/`.

**E2E harness.**
- `@playwright/test` (exact version) in `apps/web`. Config: Chromium, project `mobile-390` (390x844, `isMobile`, `hasTouch`), `baseURL` from `E2E_BASE_URL`, no `webServer`.
- Compose `web-e2e` (profile `e2e`): image `mcr.microsoft.com/playwright:v<same>-noble` (record its digest), `network_mode: host` (installability needs a `localhost` secure context), `ipc: host`, repo at `/repo`, workdir `/repo/apps/web`, `HOME=/tmp`.
- `scripts/web/e2e.sh` resolves the port with `docker compose port web 3000 | awk -F: '{print $NF}'` and runs `docker compose --profile e2e run --rm --user "$(id -u):$(id -g)" -e E2E_BASE_URL=http://localhost:$port web-e2e ./node_modules/.bin/playwright test "$@"`.
- Root script: `"test:e2e": "bash scripts/web/e2e.sh"`.
- Specs in `apps/web/e2e/`, set per test with `locale` / `extraHTTPHeaders`:
  - detection: en, es, de, fi, `nb-NO` to `no`, `pt-BR` to `pt`; `ja` to `/language` with English preselected; choose Deutsch, then German Home, survives a reload;
  - the selector to fr persists; the selector lists 11 options;
  - status `online` (observed 200 on `/api/health`); `degraded` and `offline` via `page.route` in a context with `serviceWorkers: 'block'`;
  - manifest fields, SW control, CDP installability `[]`; offline reload;
  - origin-only requests;
  - overflow at 390 and 360 for all 11 locales plus `/language`; CTA in the viewport; 44 px targets.

**Lighthouse.** `scripts/web/lighthouse-pwa.sh` runs `lighthouse` 11.7.1 (an `apps/web` devDependency, the last major with the PWA category) inside `web-e2e`:
- `CHROME_PATH` points to the image's Chromium; flags `--only-categories=pwa` and `--chrome-flags="--headless=new --no-sandbox"`;
- JSON output goes to `apps/web/test-results/lighthouse/`;
- it exits 0 only when `installable-manifest` scores 1, and it uses an `Accept-Language: en` header.
If Lighthouse 11 cannot drive the pinned Chromium, record that and report it: the CDP check then stands, and the rule is never changed silently.

**init.sh.** Update the header (6 services). Add a "Web:" step after Keycloak:
- `/` with `Accept-Language: es` returns 200 and contains `lang="es"`;
- `/` with `Accept-Language: ja` returns 307 with `location` ending in `/language`;
- `/manifest.webmanifest` returns 200;
- `/api/health` contains `"database":"up"`;
- on failure, print the `web` logs and exit 1.
Print the Web URL and the E2E/Lighthouse hints. Never run Playwright or Lighthouse.

## Expected File Changes

- `apps/web/**`: create. Configs, Dockerfile, `src/app/*` (incl. `language/`, `api/[...path]/`), `src/i18n/*`, `src/components/*`, `messages/{en,es,fr,de,it,pt,nl,sv,no,da,fi}.json`, `public/sw.js`, `public/icons/*`, optional `scripts/render-icons.ts`, `test/*`, `e2e/*`.
- `packages/api-client/**`: create.
- `apps/api/test/openapi-snapshot.spec.ts`, plus the `apps/api/package.json` script: create/modify.
- `apps/api/Dockerfile`: modify only if the api image no longer builds.
- Modify:
  - `compose.yaml` (`web`, `web-e2e`), `.env.example`, `.gitignore`, `.dockerignore`;
  - `eslint.config.mjs` (ignore `.next`, `next-env.d.ts`, `src/schema.ts`, test output);
  - root `package.json`, `pnpm-workspace.yaml` (only required build-script allowances), `pnpm-lock.yaml`.
- `scripts/web/e2e.sh`, `scripts/web/lighthouse-pwa.sh`: create (mode 755). `init.sh`: modify.

## Visual Design Impact

- UI involved: yes. Source: frames in `design/openpencil/bricomission_B2C_app.fig`, read back via the `open-pencil` MCP; DESIGN.md governs anything those frames do not define. A new design artifact is required before implementation.

### Design Brief For The OpenPencil Step

The designs are English only: no per-language frames. Every text box must tolerate about 30 % longer strings (de, fi): wrap, never truncate the CTA, and no fixed-width text. Use DESIGN.md tokens only (colors, Inter, type scale, radii, spacing, `elevation.card`, `button-primary`, `chip`, `input`). Calm, airy Apple/IKEA minimalism, no technical terms. WCAG 2.2 AA, visible `focus` ring, touch targets at least 44 px.

Frames to design:

1. **Home** at 390x844, also checked at 360x780.
   - Text wordmark "BricoMission" (no logo exists).
   - Compact language selector in the top area. Closed state: current language (native name or code plus icon).
   - Headline and a one-sentence value proposition: kitchen photos and measurements become photorealistic designs and a budget priced from real catalogs; do it yourself or get offers from validated professionals.
   - Optional short supporting content (for example 3 steps). An image only if it is a committed local asset with a known license.
   - One primary CTA, "Start your Kitchen Project", in a sticky bottom action bar.
   - A tertiary text link, "Are you a professional?", visually quieter than everything else, linking to `/professionals/register` (built by `professional-registration`).
   - No Sign in.
   - Status element placement (see 4).
2. **Language Selection** at 390x844 (conditional first-launch screen, English):
   - wordmark;
   - short title and helper text, e.g. "Choose your language" / "We couldn't match your device language.";
   - a dropdown (input style) with English preselected;
   - a primary "Continue" button.
3. **Language selector, open state** (on Home): the list of the 11 native names (English, Español, Français, Deutsch, Italiano, Português, Nederlands, Svenska, Norsk, Dansk, Suomi), with the current one marked and a visible focus style. It may be a dropdown menu or a bottom sheet (DESIGN.md `sheet` elevation).
4. **Service status, 4 states** (a small, quiet component, for example a footer line, dot plus text, never color alone):
   - checking: "Checking service…"
   - online: "Service available"
   - degraded: "Some features are temporarily unavailable"
   - offline: "You're offline or the service can't be reached"
5. **App icon** 512x512 with the maskable safe zone (inner 80 %), plus the manifest `theme_color` and `background_color`.

The read-back artifact must list per frame and element: position and size, token names (or raw values), text styles, final English copy, the icon export or SVG, the professional link note, and the line "approved by developer on <date>".

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Document the `apps/web` layout, i18n (11 locales, resolution order, cookie, `/language`), `packages/api-client` and its regeneration loop, the same-origin proxy, the compose `web` and `web-e2e` services, and the E2E layer.
- `AGENTS.md`: update. Startup step 4 gets the Web step. Add `pnpm test:e2e`, the OpenAPI regeneration commands, and the rule that every UI string goes into all 11 message files.
- `DESIGN.md`: update "Existing Design Assets" (B2C frames) and the rule "designs are English only; layouts must fit de/fi", plus any approved non-token values.
- `docs/technical-discovery.md`: update. Record the proxy decision, Lighthouse 11 plus CDP, the locale mapping (`nb`/`nn` to `no`), and that account persistence is `language-preference-account`.
- `CONSTRAINTS.md`: not needed.
- The orchestrator (not the implementer) renames `i18n-all-locales` to `language-preference-account` at line 502 of `Documentación del Proyecto_BricoMission.md`.
- `PROGRESS.md`, `feature_list.json`: evidence, status `passing` (never `accepted`).

## Implementation Plan

1. Confirm the approved design artifact exists (else `blocked`).
2. Build `packages/api-client` and the API snapshot test; commit `openapi.json` and `schema.ts`.
3. Scaffold `apps/web`: tokens, font, i18n (11 files), `resolveLocale`, `/language`, selector, Home, `ApiStatus`, proxy, manifest, icons, SW. Write the unit tests; get the workspace gate green.
4. Add the Dockerfile and compose `web`; confirm the api image still builds; update env and ignore files; add the `init.sh` Web step.
5. Add Playwright (`web-e2e`, wrapper, specs) and the Lighthouse script; run them against the stack.
6. Update the docs and evidence.

## Implementation Tasks

- [ ] Design artifact present; non-token values listed.
- [ ] api-client and drift tests.
- [ ] Tokens + token test; self-hosted Inter (latin-ext).
- [ ] `locales.ts`, `resolveLocale` + tests; 11 message files + parity test.
- [ ] `/language` with a validated cookie setter; redirect from `/`; selector.
- [ ] Proxy and its tests (forwarding, header allowlist, no cookies, `..` gives 400, 502, 503 passthrough).
- [ ] Home, `ApiStatus` (4 states), strictly from the design.
- [ ] Manifest, icons, SW, registration.
- [ ] Dockerfile, compose `web`, `.env.example`, ignore files, `init.sh`.
- [ ] Playwright, `web-e2e`, `scripts/web/e2e.sh`, root `test:e2e`, specs.
- [ ] `scripts/web/lighthouse-pwa.sh`.
- [ ] Docs, PROGRESS, evidence.

## Verification Plan

Use the orchestrator's exported env (`COMPOSE_PROJECT_NAME`, all `*_PORT` incl. `WEB_PORT`). Use `newgrp docker` if needed. No sudo, no GPU.

- `pnpm install --frozen-lockfile` (lockfile unchanged), `pnpm -r lint`, `pnpm -r test`: exit 0, also offline (`unshare -rn`). The test names show the locale and parity cases.
- `pnpm --filter @bricomission/api openapi:export && git diff --exit-code packages/api-client`.
- `docker compose config -q`; pin awk check; `grep -E '^FROM' apps/web/Dockerfile` shows exact tags; `up -d --build --wait` gives 6 healthy services; `docker compose exec -T web id -un` prints `node`; `ss -ltn` shows 127.0.0.1 only.
- curl against `http://127.0.0.1:$WEB_PORT/`:
  - `Accept-Language: de` gives `lang="de"`; `nb-NO` gives `lang="no"`;
  - `ja` gives 307 to `/language`;
  - `Cookie: NEXT_LOCALE=fi` plus `ja` gives `lang="fi"`;
  - setting an invalid locale gives 400;
  - `/api/health` gives `database: up`; `/api/..%2Fadmin` never reaches upstream; with the api stopped, `/api/health` gives 502 (restart the api after).
- `pnpm test:e2e`: all specs pass.
- `bash scripts/web/lighthouse-pwa.sh`: `installable-manifest` passes, or the fallback is reported.
- `./init.sh`: exit 0. Failure path: web stopped gives exit 1 with logs.
- `bash -n init.sh scripts/web/*.sh`.
- `grep -rEi 'fonts.googleapis|gstatic|cdn|unpkg|jsdelivr' apps/web/src apps/web/public`: no matches.

## Evidence To Capture

- Versions: Next, React, Tailwind, next-intl, openapi-typescript, openapi-fetch, Playwright (tag + digest), Lighthouse; Node base digest.
- Exit codes and key lines for every check; the E2E test list; the Lighthouse result; the design artifact path and approval date; note that the translations are agent-generated.
- Deviations go in the spec's Implementation Notes. Record in `feature_list.json` evidence and a `PROGRESS.md` session.

## Validator Checklist

- [ ] UI matches the approved English design; nothing is invented; non-token values are recorded; the tertiary professional link is rendered and points to `/professionals/register`.
- [ ] 11 locales: detection, mappings, `/language` flow, selector, cookie validation, parity test.
- [ ] No forced sign-in; one primary CTA; scope excludes account persistence, login and the Kitchen Project page.
- [ ] Home uses `@bricomission/api-client`; drift tests pass.
- [ ] The proxy is not open (fixed base, header allowlist, no cookies, `..` rejected) and leaks nothing.
- [ ] Manifest, icons and SW as specified; installability proven (CDP plus Lighthouse, or the reported fallback).
- [ ] No external requests; no overflow at 360 in de and fi.
- [ ] Compose `web` is pinned, non-root, has a healthcheck and binds 127.0.0.1 `WEB_PORT`; the api image still builds.
- [ ] `pnpm test:e2e` passes; the `init.sh` Web step passes and starts nothing in the foreground.
- [ ] Docs and evidence updated; status `passing`.

## Risks

- The api Dockerfile's frozen install may break with the new lockfile importers. Fix with `--filter @bricomission/api...` or by copying the new manifests.
- Lighthouse 11 vs a newer Chromium: the CDP check is the fallback.
- `next-intl` or the Next ESLint plugin may not support the chosen Next or ESLint 10 versions: fall back and record the deviation.
- Agent translations may contain errors (no native or manual review, developer decision); only the parity test guards them.
- Offline mode serves the cached Home in the locale it was cached in; switching language offline does not re-translate it.
- Size: this is the frontend bootstrap at the upper bound. Do not drop E2E, installability or the 11-locale checks; report if time runs out.

## Implementation Notes (implementer, 2026-11-13)

Design input: `docs/design/web-pwa-shell.md` ("Approved by developer on 2026-11-13") and the exports in `design/openpencil/web-pwa-shell/`. Built in the base checkout (default compose project, default ports, `WEB_PORT=3100`).

Versions: Next.js 16.4.6, React/React DOM 19.3.1, Tailwind CSS 4.3.5 (`@tailwindcss/postcss` 4.3.5), next-intl 4.15.1, lucide-react 1.72.0, `@fontsource-variable/inter` 5.3.0, openapi-typescript 7.13.0, openapi-fetch 0.17.0, `@playwright/test` 1.65.0 with `mcr.microsoft.com/playwright:v1.65.0-noble` (sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe, Node 26.13.1, Chromium 158), Lighthouse 11.7.1. Base image `node:26.13.1-bookworm-slim` (sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1).

Deviations and decisions (none changes a verification rule):

1. **`src/proxy.ts` (Next 16 proxy, formerly middleware) added.** It does the `/` to `/language` 307 and hands the resolved locale to the app in the request header `x-bricomission-locale` (always `en` on `/language`, any client value overwritten). Without it the shared root layout could not render `<html lang="en">` on `/language` for a visitor whose cookie or browser says otherwise. `resolveLocale` stays the single pure resolver.
2. **Cookie setter is the route handler `POST /locale`** (form field `locale`, spec option "route handler"). It also answers 403 when a present `Origin` does not match `Host` (cheap cross-site guard). The selector calls it with `fetch(..., { redirect: 'manual' })`, then `router.refresh()`. Language Selection posts a plain form, so it works without JavaScript.
3. **Icons are scaled from the design PNG export, not the SVG.** Chromium draws the SVG's `rx="999"` accent bar as an ellipse (SVG clamps `rx`/`ry` per axis), and its text baseline differs from the approved PNG. `scripts/render-icons.ts` scales `app-icon-512.png` with the Playwright image's Chromium. The 512 "any" and "maskable" icons share the artwork (full-bleed, content inside the safe zone per the design).
4. **Selector options are buttons with `aria-current="true"`** on the current language (the design allows `aria-selected`/`aria-checked`; those are not valid on plain buttons). The sheet is a native modal `<dialog>` (focus containment, Escape, inert background, backdrop click closes).
5. **Layout:** an `h-dvh` column; header fixed at the top, `main` scrolls, bottom action bar fixed at the bottom ("Header (fixed top), Content (scrolls), BottomActionBar (sticky bottom)"). The overflow E2E check therefore also inspects every scroll container, not only the document.
6. **Elevation:** step cards use the DESIGN.md `elevation.card` token (two layers). The design export shows only its `0 4 16` layer, but the read-back names the token.
7. **Non-token values** (implemented as designed, recorded in DESIGN.md): wordmark 22/28 bold; step titles 16/24 and field label 14/20 semibold; sheet title 18/24 semibold; 12 px gaps (hero, steps, bottom bar) and bottom-bar top padding; selector pill 44 high, 14 px padding, 6 px gap; option rows 48 high, 12 px padding; globe badge 56; step circles 44 with 22 px icons; sheet overlay `#1C1C1E66`.
8. **Professional link is rendered** (spec Decision 1, developer decision 2026-11-13). The Non-Goals bullet and the validator checklist line "the professional slot is not rendered" predate that decision and are stale.
9. **API status mapping:** `degraded` needs 503 with `database: down`; any other non-200 answer counts as `offline`.
10. **ESLint:** the root typescript-eslint flat config covers `apps/web` (`.ts`/`.tsx`). No `eslint-config-next`/react-hooks plugin was added (ESLint 10). `public/sw.js` declares its worker globals.
11. **API change:** `createOpenApiDocument(app)` extracted from `configureApp` in `apps/api/src/app.setup.ts`, so the snapshot test uses exactly the served document. `openapi:export` also regenerates `schema.ts`. The api Dockerfile is unchanged and still builds.
12. **pnpm:** `@parcel/watcher` (Tailwind dev watcher, prebuilt binaries) added to `ignoredBuiltDependencies`. openapi-typescript 7.13.0 declares a peer `typescript@^5` and warns with TS 6.0.3; generation works and the freshness test passes.
13. **Offline gate:** `unshare -rn` needs `ip link set lo up` first; without loopback the existing api supertest suites cannot bind (46 failures, unrelated to this feature). With loopback up, install/lint/test all pass offline.
14. Root `package.json` also gets `lighthouse:pwa` as an alias for `bash scripts/web/lighthouse-pwa.sh`.
15. Translations for the 10 non-English locales are agent-generated (developer decision 2), with no native review.
