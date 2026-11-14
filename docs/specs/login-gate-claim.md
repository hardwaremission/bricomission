# Feature Implementation Spec: Costly AI action requires login and claims the draft

## Source Feature

- `id`: login-gate-claim
- `area`: identity
- `depends_on`: moodboard-selection (accepted, merged `9cb57ed`), homeowner-password-login (accepted)
- `status`: not_started at planning time (2026-11-14); set to `in_progress` by the planner
- `source`: `feature_list.json`; branch `feature/login-gate-claim`

## Goal

Moodboard's Continue (`/kitchen-projects/new/generate`, 404 today) opens the **Generate** step: a summary of the draft Kitchen Project with the costly actions "Generate my kitchen" (Render) and "Get my budget" (Budget). An anonymous visitor who presses either sees the **Login Gate** (a sheet: Sign in / Create account). After the Keycloak sign-in (password + email code, or sign-up + email code), the browser comes back. The web then **claims** the draft: the same `kitchen_project` row (same id, photos, measurements, Moodboard) becomes `claimed`, is bound to the Account (Keycloak `sub`), and stops expiring. The browser lands on the owned project page `/kitchen-projects/<id>`.

This slice also fixes the contract later features build on: owner-scoped API routes, an ownership guard, and the two costly endpoints as authenticated placeholders (no AI call).

## Non-Goals

- Any Render, Budget, LLM or GPU call; quotas (`controlnet-render`, `budget-tier-computation`, `daily-quota-enforcement`). The broker is not touched.
- Editing a claimed project (photos, measurements, Moodboard) and a "My Kitchen Projects" list (see OQ-1, OQ-7).
- Google SSO (`google-sso-login`), account language (`language-preference-account`), Professional or Admin screens.
- Any change to anonymous draft rules (token, 404 policy, limits, photo pipeline, sliding expiry for drafts).

## Decisions (the developer accepted every recommended option, OQ-1..OQ-10, on 2026-11-14)

1. **Lifecycle.** `KitchenProjectStatus` gains `claimed`. Claim sets `status = claimed`, `owner_sub = <token sub>`, `claimed_at = now`, `expires_at = NULL` (expiry stops; the sweeper and `countOpen` already filter `status = draft`). `draft_token_hash` is **kept** (unique) so a repeated claim is idempotent and a claim with that token by another account is refused. `DraftTokenGuard` is unchanged (`status = draft` only), so the token no longer opens the project through the draft routes.
2. **Owner key.** `owner_sub text` (Keycloak `sub`, 1-255 chars), indexed. There is no local Account table yet; the domain's "local profile" arrives with `language-preference-account`. Homeowner 1-N Kitchen Projects: no per-account limit.
3. **Who may claim.** Realm role `user` only (`@Roles('user')`). Professional and Administrator tokens get 403; the draft stays anonymous (OQ-6).
4. **Claim API.** `POST /kitchen-projects/drafts/current/claim`, Bearer + `X-Draft-Token`. It lives in a **new controller without class-level `@Public()`** (`@Public()` wins over `@Roles()`; validator note from `keycloak-realm-roles`). The service reads the header itself (format check, hash) and runs under the draft row lock (`SELECT ... FOR UPDATE`):
   - `draft`, not expired: claim, 200.
   - already `claimed` by the same `sub`: 200, nothing changes (`claimedAt` unchanged).
   - claimed by another `sub`, unknown, malformed, missing or expired token: 404 (same generic body, no probing).
   - Completeness is not required for a claim (the costly endpoints check it).
5. **Web BFF claim route** `POST /api/kitchen-projects/drafts/current/claim` (static, wins over `api/[...path]`; mirrors `start-draft.ts`): same-origin `Origin` required (403); no valid session gives 401 without an upstream call; no `bm_draft` gives 404. It sends `Authorization` from the session (`getValidAccessToken`) and `X-Draft-Token` from the cookie. On 200, and on 404, it **clears `bm_draft`** (`Max-Age=0`). Body `{ project: KitchenProjectView }`, `no-store`. The client clears the `bm_draft_started` localStorage marker after a successful claim, so Capture does not show the "draft expired" notice afterwards.
6. **Owned project read.** `GET /kitchen-projects/:projectId` (`@Roles('user')`, `OwnedProjectGuard`: not the caller's, not claimed, or unknown gives 404; malformed uuid 400). `KitchenProjectView` = `{ id, status: 'claimed', measurements, photos, moodboard, claimedAt }`. Photo and upload URLs point to new owner content routes `GET /kitchen-projects/:projectId/photos/:photoId/content` and `.../moodboard/items/:itemId/content` (`?variant=thumb|full`, `private, max-age=3600`); gallery items keep the public gallery URLs. The browser loads them as same-origin `/api/...` (the proxy adds the session token).
7. **Costly endpoints (placeholders, OQ-2).** `POST /kitchen-projects/:projectId/renders` and `POST /kitchen-projects/:projectId/budget`, `@Roles('user')` + `OwnedProjectGuard`. Order: 401 no/invalid token, 403 wrong role, 404 not owner, 409 `project_incomplete` (not ready, see 8), else **501 `not_available_yet`**. `controlnet-render` and `budget-tier-computation` replace the 501 with real behavior and keep path, guards and the 409 rule. They never call the broker or an adapter here.
8. **Ready for generation** (pure function in the API, mirrored in the web): at least 1 photo, all three measurements, at least 1 Moodboard Item (the Moodboard Continue rule).
9. **Web flow.**
   - `/kitchen-projects/new/generate` (`GenerateScreen`, identical HTML for every visitor): loads the draft and `/auth/session`. No live draft: designed empty state with a link to Capture. Not ready: hint plus a link back, CTAs disabled.
   - Anonymous + CTA: Login Gate sheet. "Sign in" goes to `/auth/login?returnTo=/kitchen-projects/new/generate?intent=render|budget`; "Create account" adds `&mode=register` (Keycloak sign-up form, then the 6-digit email code; the new account has role `user`).
   - Signed in + CTA, or page load with `intent` + session + ready draft: claim at once (designed "Saving your kitchen to your account…" state), then `router.replace('/kitchen-projects/<id>?claimed=1')`. Without `intent` a signed-in visitor is never claimed automatically (OQ-5).
   - Claim results: 401 (session gone) shows the gate again; 403 shows the wrong-role state with Sign out; 404 shows the draft-expired state; 502/offline/503 show a retryable error. The draft is never lost on a failed claim.
   - `/kitchen-projects/[projectId]` (dynamic, uuid else 404 page; identical HTML): owner sees the summary (read-only), a "Saved to your account" confirmation when `claimed=1`, and the costly CTAs **disabled with an "Available soon" hint** (OQ-3). Signed out: the gate-style "Sign in to see this Kitchen Project" (returnTo = this URL). Another account or unknown: "Kitchen Project not found" with a link to Home. A "Start a new Kitchen Project" link goes to `/kitchen-projects/new`.
10. **New projects after a claim.** The cookie is cleared, so the Home CTA starts a fresh anonymous draft for anyone, signed in or not; it is claimed at its own Generate step (OQ-9). A signed-in browser keeps working on anonymous drafts until Generate.
11. **Offline.** Keycloak password + email code via Mailpit works offline. Generate and the owned page follow the Capture rules: offline alert, CTAs disabled, nothing queued. `sw.js` already skips `/api/*`, `/auth/*` and non-GET; no version bump unless it changes.

## Job Story

When I have shown my kitchen and my style and want to see the result,
I want to sign in only now, at the moment it costs something,
so my work is saved to my account and nothing I entered is lost.

## Users And Permissions

- Anonymous: draft routes as today; Generate page and gate; costly and owner routes 401.
- Homeowner (`user`): claims the browser's draft; reads only own claimed projects; costly placeholders on own projects.
- Professional / Administrator: 403 on claim, owner and costly routes. Other Homeowners: 404 for a project they do not own.

## Acceptance Scenarios

### Scenario 1: Generate step (anonymous)
Given a ready draft (Moodboard Continue) at 390x844, then `/kitchen-projects/new/generate` shows the designed summary, the primary "Generate my kitchen" and the secondary "Get my budget". No request to a costly or owner route is made.

### Scenario 2: Gate, sign in, claim (feature verification)
When the visitor presses Generate, the gate sheet appears. Sign in as `bm-homeowner` with the Mailpit code. The browser lands on `/kitchen-projects/<id>` where `<id>` equals the draft id from before. It shows the same photo and Moodboard thumbnails, the measurements and the confirmation. `GET /api/kitchen-projects/<id>` gives `status: claimed`. `GET /api/kitchen-projects/drafts/current` gives 404 (cookie cleared). psql: `owner_sub` = the account's `sub`, `expires_at` NULL, `claimed_at` set.

### Scenario 3: Create account path
Same as 2 via "Create account": the registration form, then the email code, then back and claimed by the new account (its `sub`).

### Scenario 4: Claim rules (API)
- 401 without Bearer; 403 for `professional` and `admin` tokens (draft unchanged).
- 404 for missing, malformed, unknown and expired tokens.
- Repeated claim by the same `sub`: 200, same body, `claimed_at` unchanged.
- The same token with another `sub`: 404. Two concurrent claims with different `sub`s: exactly one 200.
- After a claim the draft routes with that token give 404, and the sweeper never deletes the claimed row (`expires_at` NULL).

### Scenario 5: Ownership and costly placeholders
- `GET /kitchen-projects/:id` and the content routes: owner 200; another Homeowner 404; anonymous 401; professional 403; a draft's id 404.
- `POST .../renders` and `.../budget`: anonymous 401, other roles 403, non-owner 404, not-ready project 409 `project_incomplete`, owner + ready 501 `not_available_yet`. Through the web proxy, anonymous also gives 401.

### Scenario 6: Signed in before Generate; wrong role; failures
- Already signed in: Generate claims at once with no gate.
- `bm-professional` at the gate: wrong-role state, draft still anonymous and reachable.
- Expired draft at claim: expired state with a link to start again.
- API down: retryable error, draft kept.
- Signing out on the owned page shows the sign-in state; signing in again shows the project.

### Scenario 7: Layout, i18n, gates
Designed states at 390x844 (en, es) and 360x780 (de, fi): no horizontal overflow, targets >= 44 px, one primary CTA. New namespaces in all 11 message files. `pnpm -r lint`, `pnpm -r test` (OpenAPI drift), `./init.sh`, `pnpm test:e2e` pass.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `ARCHITECTURE.md`, `PROGRESS.md`, `feature_list.json`; `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/risks-and-open-questions.md`; PRD lines 77 and 334 (grep); `docs/specs/{kitchen-capture-draft,moodboard-selection}.md`; `docs/design/{homeowner-password-login,moodboard-selection}.md` (grep).
- API: `src/auth/{auth.guard,auth.decorators,auth.types}.ts`, `src/kitchen-projects/{draft-token.guard,kitchen-drafts.controller,kitchen-drafts.repository}.ts`, `kitchen-drafts.service.ts` (grep), `prisma/schema.prisma`, `packages/shared-types/src/index.ts` (grep).
- Web: `src/lib/api-proxy.ts` (already sends both Bearer and `X-Draft-Token`), `src/lib/kitchen-draft/{start-draft,draft-cookie,draft-client}.ts`, `src/lib/auth/{handlers,return-to}.ts`, `src/app/api/{[...path],kitchen-projects/drafts}/route.ts`, `MoodboardScreen.tsx` (`GENERATE_PATH`), `e2e/moodboard.spec.ts:307-330` (asserts the 404), `e2e/support.ts` (`completeKeycloakSignIn`, Mailpit helpers).
- Not inspected: `docs/technical-discovery.md` and `DESIGN.md` in full, `CaptureScreen.tsx`, `session.ts` internals, `test/support/tokens.ts`, the GPU job controller.

### Patterns To Follow

Thin controllers, pure services, repository interface plus an in-memory test repo, injected clock; hand-edited `prisma migrate diff` migrations that keep the catalog HNSW index; OpenAPI regeneration loop; BFF handler factories with injected `fetch`; 11 message files; E2E imports `test` from `e2e/fixtures.ts`.

## Technical Approach

- **Prisma / migrations.** Two migrations, because PostgreSQL rejects a new enum value used in the same transaction ("unsafe use of new value"):
  - `2026111500xxxx_kitchen_project_claimed_status`: `ALTER TYPE kitchen_project_status ADD VALUE 'claimed'`.
  - `..._login_gate_claim`: `owner_sub text`, `claimed_at timestamptz(3)`, `expires_at` DROP NOT NULL, index on `owner_sub`, and a hand-written CHECK: `draft` = `owner_sub` and `claimed_at` NULL, `expires_at` and token hash NOT NULL; `claimed` = `owner_sub` and `claimed_at` NOT NULL, `expires_at` NULL; `owner_sub` length 1-255.
- **API** (`src/kitchen-projects/`):
  - `kitchen-projects.controller.ts` (claim, GET project, two content routes, two costly placeholders; `@ApiBearerAuth()`, plus `@ApiSecurity('draftToken')` on claim).
  - `owned-project.guard.ts` with `@CurrentProject()`, exported for later features.
  - `kitchen-projects.service.ts` (claim, view, content via the existing storage helpers).
  - `readiness.ts` (pure).
  - Repository: `claimByTokenHash(hash, sub, now)` returning `{ record, created } | 'not_found'`, and `findOwned(id, sub)`.
  - Records get `status: 'draft' | 'claimed'`, `ownerSub`, `claimedAt`, nullable `expiresAt`. Draft views keep a non-null `expiresAt`.
- **Shared types:** `KitchenProjectStatus` = `'draft' | 'claimed'`; `KitchenProjectView`; `ClaimKitchenDraftResponse`; codes `project_incomplete`, `not_available_yet`. Regenerate OpenAPI and `api-client`.
- **Web:**
  - `src/lib/kitchen-draft/claim-draft.ts` (BFF factory) and `src/app/api/kitchen-projects/drafts/current/claim/route.ts`.
  - `src/lib/kitchen-draft/{readiness,generate-state}.ts` (pure).
  - `src/app/kitchen-projects/new/generate/page.tsx`, `src/app/kitchen-projects/[projectId]/page.tsx`.
  - `src/components/generate/` (names follow the design, for example `GenerateScreen`, `ProjectSummary`, `LoginGateSheet`, `OwnedProjectScreen`).
  - Message namespaces `generate` and `project` in 11 files (10 agent-translated).
  - Test ids: `generate-render`, `generate-budget`, `login-gate`, `login-gate-sign-in`, `login-gate-register`, `generate-claiming`, `project-claimed`, `project-not-found`, `generate-wrong-role`.
- **init.sh Web step:** `/kitchen-projects/new/generate` 200; `POST /api/kitchen-projects/drafts/current/claim` without Origin 403; API `POST /kitchen-projects/00000000-0000-4000-8000-000000000000/renders` without a token 401.

## Expected File Changes

- Create: the API files above, two migrations, `apps/api/test/kitchen-projects/{claim.http,owned-project.http,readiness}.spec.ts`; the web files above, `apps/web/test/{claim-draft,generate-state,readiness}.test.ts`, `apps/web/e2e/login-gate.spec.ts`.
- Modify: `prisma/schema.prisma`, `kitchen-drafts.repository.ts`, `kitchen-projects.module.ts`, `test/support/memory-*.ts`, `migration.spec.ts`, `draft-cleanup.spec.ts` (claimed rows untouched); `packages/shared-types`, `packages/api-client/{openapi.json,src/schema.ts}`; `apps/web/messages/*.json` (11), `e2e/moodboard.spec.ts` (Continue now opens Generate); `init.sh`.
- Docs (below), `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

UI involved. The orchestrator runs the OpenPencil step with the developer on `design/openpencil/bricomission_B2C_app.fig`, new page **Generate**, before any UI code. Read-back: `docs/design/login-gate-claim.md` with "approved by developer on <date>" and exports in `design/openpencil/login-gate-claim/`. Missing artifact: UI tasks `blocked` (API work may start).

Design brief (English only, 390x844, DESIGN.md tokens, targets >= 44, one primary CTA, reuse the Capture/Moodboard header, bottom bar, alerts and the account/language sheet pattern):

1. Generate, anonymous, ready: back to Moodboard, "Step 3 of 3" (or no step indicator, designer's choice), summary (photo, measurements, Moodboard strip), primary "Generate my kitchen", secondary "Get my budget".
2. Not ready / no draft: hint and link back; CTAs disabled.
3. Login Gate sheet: title such as "Sign in to generate your kitchen", reassurance ("Your kitchen is saved to your account"), "Sign in" (primary), "Create account", Close.
4. Claiming state ("Saving your kitchen to your account…").
5. Owned project: confirmation banner, read-only summary, CTAs disabled + "Available soon", "Start a new Kitchen Project".
6. States: wrong role (with Sign out), draft expired, claim failed/offline (Retry), project not found, signed out on the owned page.
7. 360x780 checks in de and fi for frames 1, 3 and 5.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update (claim API and BFF route, owner guard, owned and costly routes, new pages, migrations, tests).
- `AGENTS.md`: update "Kitchen Drafts" (claim clears `bm_draft`; claimed projects never expire; costly placeholders 501 until their features).
- `docs/domain-model.md`: update (owner, `claimed_at`, expiry stops, the claim rules, readiness).
- `docs/user-and-access-model.md`: update (ownership boundary, who may claim, 404 for foreign projects, signed-in browsers use drafts until Generate).
- `CONTEXT.md`: update the Login Gate entry (claim at Generate).
- `docs/technical-discovery.md`: update (owner key = Keycloak `sub`, no local account table yet; BFF claim).
- `docs/risks-and-open-questions.md`: add: no project list (re-entry by URL only); orphaned projects if a Keycloak user is deleted; `sub` stability with Google SSO linking; the open questions until answered.
- `DESIGN.md`: update the asset list and non-token values from the read-back. `CONSTRAINTS.md`: not needed (does not exist).

## Implementation Plan And Tasks

- [ ] Developer answers the open questions; design read-back approved (UI tasks blocked until then).
- [ ] Two migrations, schema, records, repository (`claimByTokenHash` under the row lock, `findOwned`), memory repo.
- [ ] `readiness.ts`, `OwnedProjectGuard`, service, new controller (claim, GET, content x2, placeholders x2); HTTP tests with `test/support/tokens.ts`.
- [ ] Shared types; `openapi:export`; drift clean.
- [ ] BFF claim route + unit tests (403 Origin, 401 no session without upstream call, 404 and cookie cleared, 200 cookie cleared and body, 502).
- [ ] Generate page, gate sheet, claim on return, owned project page; message files; moodboard E2E update.
- [ ] `e2e/login-gate.spec.ts`; `init.sh` lines; docs; evidence; status `passing`.

## Verification Plan

Use the orchestrator's env (`COMPOSE_PROJECT_NAME`, ports). No sudo, no GPU, never read `.env`.

- Workspace gate: `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test` (also offline). Required API tests: Scenarios 4 and 5 in full, readiness boundaries, claimed rows ignored by `findExpired`/`countOpen`/`deleteDrafts`, the migration SQL (enum value alone in the first migration, CHECK present, no `DROP INDEX`), OpenAPI security on the new routes, and `@Public()` absent from the new controller.
- OpenAPI: `pnpm --filter @bricomission/api openapi:export`; additive diff only, apart from the `KitchenProjectStatus` enum widening.
- Stack: `docker compose up -d --build --wait` (6 healthy), migrations applied on start.
- curl with real tokens (dev client password grant, as in `keycloak-smoke.sh`):
  - claim 200, then 200 again;
  - with the `bm-professional` token 403;
  - a second Homeowner's token (create one via sign-up, or use any second `user` account) 404;
  - GET project for owner, other user and anonymous;
  - placeholders 409/501;
  - through the web: claim without Origin 403, without session 401.
- psql: `\d kitchen_project` (CHECK, index, nullable `expires_at`), the claimed row values, catalog HNSW index still present. Sweeper: with a claimed row present, `docker compose restart api` (the sweep runs on start): the row and its MinIO objects survive.
- E2E `pnpm test:e2e`, new `login-gate.spec.ts` (web, Keycloak, Mailpit origins only):
  - Scenarios 1-3 and 6 (seed the draft through the UI or same-origin `/api` calls; sign-up with a unique `e2e-gate-*` user);
  - id equality and cookie-cleared checks;
  - the 401 through the proxy;
  - layouts per Scenario 7.

  All existing specs stay green, with the moodboard Continue test updated.
- `./init.sh` exit 0 with the new lines; `./scripts/keycloak-smoke.sh` exit 0.

## Evidence To Capture

Test names and counts, the OpenAPI diff summary, curl outputs (statuses only, never tokens), psql output, the E2E list, the `./init.sh` tail, the design artifact path and approval date. Deviations go in this spec's Implementation Notes.

## Validator Checklist

- [ ] UI matches `docs/design/login-gate-claim.md`; English design, 11 locales; one primary CTA; sign-in only at Generate (never on Home, Capture or Moodboard).
- [ ] Claim needs Bearer (role `user`) **and** the draft token; idempotent for the same `sub`; 404 for other accounts and bad tokens; row lock; same id kept.
- [ ] `bm_draft` cleared after a claim; the token never reaches HTML, JS, logs or the DB as text; CSRF Origin rule on the BFF route.
- [ ] New controller has no `@Public()`; owner routes return 404 for foreign projects; costly placeholders 401/403/404/409/501 and no broker or adapter call.
- [ ] Claimed projects never expire or get swept; anonymous draft behavior unchanged.
- [ ] Migrations split for the enum; CHECK present; HNSW index intact; OpenAPI and api-client regenerated.
- [ ] Docs updated; gates pass; status `passing`, not `accepted`.

## Risks

- Enum value plus CHECK in one migration fails at deploy: keep two migrations.
- Auto-claim on return races with session hydration: claim only after `/auth/session` says `signedIn: true`; the BFF also returns 401 without a session.
- Keycloak sign-up in E2E creates accounts in the dev realm (cleared by a realm reset).
- Shared `bm_session` cookie across worktree ports (known risk): run the E2E in one worktree at a time.

## Open Questions For The Developer (recommended default first)

**Developer answers (2026-11-14):** OQ-1..OQ-10 all answered with the recommended option (read-only claimed project; 501 placeholders with the full guard chain; disabled "Available soon" buttons; both Render and Budget open the gate; automatic claim on return with `intent`; Professional/Admin get 403 + Sign out message; projects found by URL only; bottom-sheet gate; signed-in users also start an anonymous draft claimed at Generate; Generate is "Step 3 of 3" and Capture/Moodboard become "of 3"). No open questions remain.


1. **OQ-1 Editing after claim.** Recommended: the claimed project is read-only in this slice. Editing returns later through owner routes. Alternatives: (a) owner-scoped edit routes and Capture/Moodboard reused in this slice (larger); (b) the draft token keeps working for the owner after a claim (mixes two access models).
2. **OQ-2 Costly endpoints.** Recommended: `POST /kitchen-projects/:id/renders` and `/budget` placeholders with the full guard chain, answering 501 `not_available_yet`. Alternatives: no placeholder routes (the 401 test then targets only the claim and owner routes); a fake broker job (adds GPU-path scope here).
3. **OQ-3 CTAs on the owned page.** Recommended: disabled with an "Available soon" hint until `controlnet-render`/`budget-tier-computation`. Alternative: enabled, calling the placeholder and showing a designed "not available yet" message.
4. **OQ-4 Gate triggers.** Recommended: both "Generate my kitchen" (primary) and "Get my budget" (secondary) open the gate. Alternative: only the Render CTA now; Budget is added by its feature.
5. **OQ-5 Claim on return.** Recommended: automatic after sign-in when `intent` is in the return URL. Alternative: an explicit "Save to my account" confirmation step.
6. **OQ-6 Non-Homeowner roles.** Recommended: Professional and Admin get 403 and a "This account can't own Kitchen Projects" state with Sign out; the draft stays anonymous. Alternative: any signed-in role may claim.
7. **OQ-7 Finding a claimed project again.** Recommended: by URL only in this slice; record a "My Kitchen Projects" list as a gap for a later feature. Alternative: add `GET /kitchen-projects` and a link in the Account sheet now (more UI and API).
8. **OQ-8 Gate form.** Recommended: a bottom sheet on the Generate page (explains why, offers Sign in / Create account). Alternatives: a full page; a direct redirect to Keycloak with no explanation.
9. **OQ-9 Signed-in users starting a project.** Recommended: they also start an anonymous draft, claimed at Generate (one flow for everyone). Alternative: owned from the first save when signed in (needs owner-scoped edit routes, see OQ-1).
10. **OQ-10 URLs and step indicator.** Recommended: `/kitchen-projects/new/generate` for the draft and `/kitchen-projects/<id>` for the owned project. The Generate step becomes "Step 3 of 3", which changes the "of 2" copy on Capture and Moodboard in all 11 files. Alternative: no step indicator on Generate (Capture/Moodboard unchanged).

## Implementation Notes (implementer, 2026-11-14)

- Implemented as specified; the design read-back governs the UI. Deviations and choices:
  - The API claim returns `{ project: KitchenProjectView }` (same shape as the BFF), so a repeated claim gives a byte-identical body.
  - `KitchenDraftView.status` is now the literal `'draft'` (OpenAPI enum unchanged); `KitchenProjectStatus` widened to `'draft' | 'claimed'`. New shared type `KitchenProjectErrorCode` (`project_incomplete`, `not_available_yet`, `storage_unavailable`).
  - The claim locks by id: it finds the row by token hash, then `SELECT ... FOR UPDATE` on the id and re-reads it, so the loser of a race sees the winner's claim (404).
  - `OwnedProjectGuard` does its own uuid check (400) because it runs before pipes; it answers 404 for unknown, draft and foreign ids, after the global 401/403 guards.
  - `GET /kitchen-projects/:projectId` maps 403 and 404 to the same "not found" page state (a Professional opening a project URL sees "not found").
  - The BFF claim route checks the session before the cookie (no session: 401 even without `bm_draft`).
  - Summary measurements are always shown in metres (the Capture unit choice is not persisted); missing measurements show a single `—`.
  - The wrong-role "Sign out" posts to `/auth/logout`, which returns to Home (existing behavior).
  - A latent bug was fixed on the way: `draft.photos.map(photoView)` would have passed the array index as the new `photosPath` argument; it now uses an arrow function.
- Not run: the workspace gate with the network disabled (tests are DB/network-free by construction); Lighthouse (no manifest or service worker change; `sw.js` unchanged, no version bump).
