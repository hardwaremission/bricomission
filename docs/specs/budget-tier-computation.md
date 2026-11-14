# Feature Implementation Spec: Homeowner receives four verified Budget Tiers

## Source Feature

- `id`: budget-tier-computation
- `area`: ai-budget
- `depends_on`: catalog-rag-ingestion (accepted), gpu-job-broker (accepted), login-gate-claim (accepted)
- `status`: not_started at planning time (2026-11-15); set to `in_progress` by the planner
- `source`: `feature_list.json`; branch `feature/budget-tier-computation` (worktree `../hardwaremission.bricomission-worktrees/budget-tier-computation`)
- Feature notes: ADR 0002. Schema-constrained JSON from llama-server. UI gate: Budget Tier Overview screen.

## Goal

A signed-in Homeowner with a ready, claimed Kitchen Project asks for a Budget. The API retrieves Catalog chunks with the Catalog RAG index, asks the LLM (llama-server, JSON-schema-constrained) for Luxury/High/Medium/Low tiers whose Line Items cite a source chunk, SKU and quoted price, verifies every quoted price against that chunk's text, rejects unverified Line Items, and computes every subtotal and tier total in exact decimal-safe code (ADR 0002). `POST /kitchen-projects/:projectId/budget` stops answering 501; it keeps its path, its guards and the 409 `project_incomplete` rule. A new web screen shows the four tier cards with expandable Line Items and citations.

## Non-Goals

- Budget chat, Personas, Prompt Macros (`budget-chat-personas`, `budget-prompt-macros`), tier selection, DIY Shopping List PDF, Dossier.
- Quotas and usage counters (`daily-quota-enforcement`). No new compose services, no new models, no cloud fallback.
- Editing or deleting saved Budgets, a Budget PDF, price history per SKU, non-EUR catalogs.
- SSE for budget status (polling, like Renders), a durable GPU queue.

## Decisions (OQ-1..OQ-5 confirmed by the developer on 2026-11-14: all recommended options)

1. **One LLM call, four tiers.** One `LlmAdapter.complete` with `jsonSchema` returns all four tiers at once. The prompt carries the room Measurements and a numbered list of retrieved Catalog chunks. Four sequential calls would triple GPU time and break the broker job timeout (120 s default).
2. **Retrieval is fixed-category, synchronous, outside the GPU job.** `buildBudgetQueries(measurements)` returns ~8 fixed category queries (`base cabinet`, `wall cabinet`, `worktop`, `sink and tap`, `tiles`, `flooring`, `lighting`, `appliances`); each `CatalogSearchService.search` with limit 5; results de-duplicated by chunkId, ranked, capped at 30 chunks and ~12 000 characters. Embedder down → 503 `embedding_unavailable`; zero chunks → 409 `catalog_empty`. Both fail before any row or broker submit.
3. **Citations are chunk refs, verified against stored chunk text.** The prompt numbers chunks `[source N]` and prints each chunk text verbatim. Schema item fields: `name`, `sku`, `chunkRef` (integer), `quotedPrice` (decimal string as printed), `quantity` (decimal string), `unit`. Verification, per Line Item: the `quotedPrice` literal (normalized: comma decimal accepted) appears in that chunk's `catalog_chunk.text`; the `sku` appears too; otherwise the Line Item is rejected. On the first attempt with ≥1 kept item, no retry; if every item was rejected (or JSON/parse failed), one retry with a feedback message listing rejection reasons (`BUDGET_MAX_ATTEMPTS` total 2). Still nothing → `failed` / `verification_failed`. A tier with zero kept items after the last attempt also fails the Budget.
4. **All money is exact integer minor units.** New pure module `budget-math.ts`: parse decimal strings (max 2 dp) to cents BigInt; `subtotalCents = round_half_up(priceCents × quantityHundredths / 100)`; tier subtotal = sum of subtotals; VAT from `vatBps` (see OQ-1): inclusive → `gross = subtotal`, `net = round_half_up(gross × 10000 / (10000 + vatBps))`, `vat = gross − net`. No float, no decimal library. Same Line Items always give byte-identical totals (property unit test). API transports money as integer cents + `currency: 'EUR'`; never a decimal string with a comma. The LLM never produces an amount that bypasses this: only `quotedPrice` (verified) and `quantity` come from it.
5. **Lifecycle mirrors Renders, with polling (accepted pattern, OQ of controlnet-render Decision 5).** `queued -> running -> succeeded | failed` (`adapter_error`, `timeout`, `interrupted`, `verification_failed`). POST answers 202 `queued`; the web polls `GET .../budgets/:budgetId` every 2 s (first poll 0.5 s). One active Budget per project (409 `budget_in_progress`); history kept, newest first; at most `BUDGET_MAX_PER_PROJECT` (default 5) non-failed (409 `budget_limit_reached`). On API start, `BudgetRecoveryService` marks `queued`/`running` rows `failed` / `interrupted` (in-memory GPU jobs are lost).
6. **GPU path.** Inside the job: `broker.submit('llm', run, { ownerRef: sub })`. `llama-server` runs alone (no ComfyUI) for budget work; measured 3.2 GB VRAM, 25.5 tok/s. Cap the schema at 8 items/tier (~1 400 completion tokens ≈ 55-60 s worst case, inside the 120 s `GPU_BROKER_LLM_TIMEOUT_MS`). No storage, no MinIO keys: the Budget is pure database rows.
7. **Fake adapter JSON mode for tests/E2E.** `FakeLlmAdapter.complete` currently returns `fake:<hash>` (not JSON). Extend it: when `req.jsonSchema` is present, return deterministic Budget JSON derived from the prompt text — parse the `[source N]` chunk blocks, and per tier pick chunks round-robin, extracting each chunk's first SKU token and its printed price with regex, quantity fixed (1-3 by deterministic index). Any ingested Catalog passes verification; two runs over the same prompt give identical totals. HTTP edge cases (bad prices, malformed JSON, retries) use scripted adapters injected via the DI token like the broker/render tests do.
8. **Entry point mirrors renders.** `?intent=budget` claim lands on `/kitchen-projects/<id>/budget?claimed=1&start=1`; the page POSTs once (the server's one-active rule prevents doubles) and strips the query params. The owned page's "Get my budget" is enabled: it links to the budget page ("Get my budget" / later "See my budget" wording decided by design).

## Job Story

When my kitchen, measurements and style are saved, I want one Budget with a clear luxury-to-cheap range where every price points at a real catalog page, so I can pick a level I can actually afford and trust the number.

## Users And Permissions

- Homeowner (`user`) owner: create and read Budgets on own claimed projects.
- Other Homeowners: 404. Professional/Admin: 403. Anonymous: 401. Draft ids: 404 (`OwnedProjectGuard`). DB down: 503.
- All Budget routes sit in `KitchenProjectsController` (class `@Roles('user')`, no `@Public()`).

## API Contract

- `POST /kitchen-projects/:projectId/budget` (empty body). Order: 401/403 → 400 malformed id → 404 not owned → 409 `project_incomplete` → 503 `embedding_unavailable` / 409 `catalog_empty` (retrieval) → 409 `budget_in_progress` / 409 `budget_limit_reached` (row lock + insert) → 429 `gpu_queue_full` (row deleted). Success **202** `{ budget: BudgetView }`.
- `GET /kitchen-projects/:projectId/budgets` → 200 `{ budgets: BudgetView[]; maxBudgets: number }`, newest first.
- `GET /kitchen-projects/:projectId/budgets/:budgetId` → 200 `BudgetView`; 400 malformed id, 404 unknown/foreign.
- `BudgetView` = `{ id, status, position, waitingFor, currency: 'EUR', vatPercent, errorCode, createdAt, startedAt, finishedAt, lineItemsCount, tiers: BudgetTierView[] }`. `tiers` is empty until `succeeded`. `BudgetTierView` = `{ tier: 'luxury'|'high'|'medium'|'low', subtotalCents, vatCents, totalCents, items: BudgetLineItemView[] }`. `BudgetLineItemView` = `{ name, sku, catalogName, pageNumber, unit, quantity, quotedPrice, unitPriceCents, subtotalCents }`. Internal and never returned: prompt, token counts, gpu job id, source quote. Shared types: `BudgetStatus`, `BudgetTier`, `BudgetErrorCode` (`adapter_error|timeout|interrupted|verification_failed`), `BudgetView`, `BudgetTierView`, `BudgetLineItemView`, `BudgetListResponse`, `CreateBudgetResponse`; new `KitchenProjectErrorCode` values `budget_in_progress`, `budget_limit_reached`, `catalog_empty`, `embedding_unavailable`; drop `not_available_yet` from use. Then `pnpm --filter @bricomission/api openapi:export` and commit `packages/api-client/openapi.json` + `src/schema.ts` (the only non-additive change: budget POST 501 → 202/409/429/503).

## Acceptance Scenarios

### Scenario 1: Budget with the fake adapter (API)
Given an owned ready project, a seeded in-memory catalog (FakeEmbedder + memory CatalogRepository) and the fake JSON mode, the owner POSTs: 202 `queued`, then `running`, then `succeeded` with exactly four tiers, each with ≥1 Line Item whose `catalogName`/`pageNumber` come from the cited chunk. `GET .../budgets` lists it newest first.

### Scenario 2: Guards and limits
Anonymous 401, Professional 403, foreign Homeowner 404, draft id 404. Not-ready project: 409 `project_incomplete` and neither the broker nor the search runs. Second POST while active: 409 `budget_in_progress`. 6th non-failed: 409 `budget_limit_reached`. Queue full: 429 and no row. Embedder down: 503 `embedding_unavailable`, no row.

### Scenario 3: Price verification (ADR 0002 core)
A scripted adapter returns a Line Item quoting `199.90` against a chunk that prints `189.90` (sample catalog edition 1): that item is rejected; kept items still form the tiers; no rejected item appears in any response or total. If every item is rejected, exactly one retry with feedback happens; a second full rejection gives `failed` / `verification_failed`. Malformed JSON also retries once then fails.

### Scenario 4: Decimal math and idempotency (unit tests)
`budget-math.spec.ts`: subtotals with fractional quantities (2.5 m of a 189.90 worktop), half-up rounding at cents, VAT-inclusive breakdown at 21 %, sum order independence. Feeding the identical Line Item list twice returns byte-identical totals. Two fake-adapter POSTs on the same project end with equal tier totals.

### Scenario 5: Failure and restart
Adapter error → `failed` / `adapter_error`; broker timeout → `timeout`. An API restart with an active row (fake job, delayed via `AI_FAKE_LLM_DELAY_MS`) marks it `failed` / `interrupted`; the next POST is 202.

### Scenario 6: Budget Tier Overview screen (fake adapter, E2E)
Sign in, claim with `intent=budget`, land on `/kitchen-projects/<id>/budget`. The queued state shows the position when known; running shows an indeterminate "about a minute" state; succeeded shows four tier cards (tier name, total), tier expansion reveals Line Items (name, SKU, unit price × quantity = subtotal) and the citation ("<catalog>, page <n>"). The failed state offers Retry. Layout: 390x844 (en, es), 360x780 (de, fi); no horizontal overflow; targets ≥ 44 px; one primary CTA; currency rendered with `Intl.NumberFormat` for the locale.

### Scenario 7: Real LLM (feature verification)
`AI_ADAPTERS=local`, `llama-server` alone under `flock /tmp/bricomission-gpu.lock`, sample Catalog ingested, sample claimed project: `bash scripts/ai/budget-smoke.sh` reaches `succeeded` with four tiers within the broker timeout; every Line Item passed verification; psql recomputation of tier totals from `budget_line_item` matches `budget_tier`. Log token counts and seconds.

### Scenario 8: Gates
`pnpm -r lint`, `pnpm -r test` (incl. OpenAPI drift and message parity), `./init.sh`, `pnpm test:e2e`, `./scripts/keycloak-smoke.sh` pass. `pnpm -r test` needs no GPU, Docker or network.

## Repository Research

### Files Inspected
`AGENTS.md`, `PROGRESS.md`, `feature_list.json`, `CONTEXT.md`, `docs/{build-brief,domain-model,technical-discovery,risks-and-open-questions}.md`, `docs/adr/0001-0004`, `ARCHITECTURE.md`, `docs/specs/controlnet-render.md` (pattern), PRD §3 screen 5.
API: `kitchen-projects/{kitchen-projects.controller,kitchen-projects.service,readiness,owned-project.guard}.ts`, `kitchen-projects/renders/{renders.service,render.config}.ts`, `ai/{ai.module,ai-endpoints.provider}.ts`, `ai/adapters/{llm-adapter,llama-server-llm.adapter,fake-llm.adapter}.ts`, `ai/jobs/gpu-job-broker.service.ts`, `catalog/{catalog.module,catalog-search.service,catalog.config}.ts`, `catalog/embedding/{embedder,fake.embedder}.ts`, `prisma/schema.prisma`, `prisma/migrations` (latest `20261116000000_controlnet_render`), `test/catalog/search.spec.ts`. Web: `components/generate/OwnedProjectScreen.tsx` (disabled "Get my budget", `budgetsSoon`), `lib/kitchen-draft/generate-state.ts` (`intent=budget` lands on the owned page today). `infra/catalog/samples/README.md` (prices `189.90 EUR`, edition 2 reprices `BM-SYN-WTP-300` to `199.90` — free negative fixture).

### Existing Patterns
Render service end-to-end (POST outside the GPU slot, row lock insert, `broker.submit`, failure handling, recovery service, DTO/Swagger, memory repo tests, smoke script). `isReadyForGeneration`, `draftError(code)`, `OwnedProjectGuard`/`@CurrentProject()`. Hand-edited migrations with CHECKs (keep the catalog HNSW index). `LlamaServerLlmAdapter` sends `response_format json_schema strict` (validated 12/12, ADR 0001). Polling reducer + client with injected timers (`lib/renders/`). `e2e/fixtures.ts`.

### Current Gaps
No budget tables, routes, types, or UI (the 501 placeholder and the disabled CTA exist). `FakeLlmAdapter` returns non-JSON, so the fake stack cannot complete a budget today (Decision 7 fixes it). `init.sh` never starts the `rag` embedder and never ingests Catalogs: E2E and the smoke script must start `embedder` (CPU-only profile) and ingest `infra/catalog/samples/` themselves. VAT policy is unresolved in `docs/risks-and-open-questions.md` (OQ-1).

## Technical Approach

- **Prisma**: enums `budget_status`, `budget_tier`. Tables:
  - `budget`: `id`, `kitchen_project_id` FK cascade, `status`, `error_code`, `currency` char(3), `vat_bps` int, `attempts` int, `prompt` text + `prompt_tokens`/`completion_tokens` (internal), `gpu_job_id`, timestamps. Index `(kitchen_project_id, created_at)`. CHECKs: `succeeded` ⇒ `finished_at` NOT NULL; `failed` ⇒ `error_code` NOT NULL.
  - `budget_tier`: `budget_id` FK cascade, `tier`, `@@unique(budget_id, tier)`, `subtotal_cents`, `vat_cents`, `total_cents` (bigint, code-computed at finalize).
  - `budget_line_item`: `budget_id` FK cascade, `tier`, `position`, `product_name`, `sku`, `catalog_name`, `page_number`, `source_quote` varchar(200), `quoted_price` text (verbatim), `unit_price_cents` bigint, `quantity` text, `quantity_h` int (hundredths), `unit`, `subtotal_cents` bigint. Index `(budget_id, tier, position)`. No FK to `catalog_chunk` (re-ingest replaces chunks; the citation is stored as data).
  - One migration `20261117000000_budget_tier_computation` (new enums are safe in-migration).
- **`src/kitchen-projects/budget/`**: `budget.config.ts` (`BUDGET_MAX_PER_PROJECT`=5, `BUDGET_VAT_PERCENT`=21 → `vat_bps`, `BUDGET_MAX_ATTEMPTS`=2, `BUDGET_CHUNK_LIMIT`=30), `budget.service.ts` (mirrors `RendersService`), `budget.repository.ts` + memory repo in `test/support/`, `budget-recovery.service.ts`, `budget-engine/budget-prompt.ts` (queries + chunk block rendering), `budget-extraction.ts` (JSON Schema for `jsonSchema`, parse + per-item verification against chunk text), `budget-math.ts` (pure, tested). `CatalogModule` already exports `CatalogSearchService`; add `CatalogModule` import to `KitchenProjectsModule`.
- **501 replacement**: `requestBudget` gets `@HttpCode(202)` + Swagger 202/400/409/429/503 like `requestRender`; the `Costly()` decorator and `requestCostlyAction` lose their last user and are removed; `CostlyAction` type deleted. Update the login-gate HTTP test that asserts 501.
- **Web**: `src/app/kitchen-projects/[projectId]/budget/page.tsx` (uuid param, identical HTML), `src/components/budget/*` named after the design, `src/lib/budget/{budget-state.ts,budget-client.ts}` (pure reducer + poll loop, injected timer), `OwnedProjectScreen.tsx` CTA enabled (drop `budgetsSoon`), `GenerateScreen`/`generate-state` intent=budget redirect, `budget` namespace in all 11 `messages/<locale>.json`. Test ids: `budget-start`, `budget-status`, `budget-position`, `budget-tier-<tier>`, `budget-items-<tier>`, `budget-item-<n>`, `budget-source-<n>`, `budget-failed`, `budget-retry`.
- **Infra**: compose `api` env + `.env.example`: `BUDGET_VAT_PERCENT=21`, `BUDGET_MAX_PER_PROJECT=5`. `init.sh` adds the line `API GET /kitchen-projects/00000000-0000-4000-8000-000000000000/budgets (no token) -> 401`; keep the existing renders line.
- **Script**: `scripts/ai/budget-smoke.sh` (bash, `flock /tmp/bricomission-gpu.lock`, same draft/claim flow as `render-smoke.sh`): starts `--profile ai` with llama-server only (stop comfyui), ingests samples via `scripts/catalog/ingest.sh` when the index is empty, POSTs, polls to terminal, prints four tier totals + citations + seconds + token counts; `--no-gpu` runs the same flow on the fake adapter.

## Expected File Changes

- Create: `src/kitchen-projects/budget/**` (above), migration, `scripts/ai/budget-smoke.sh`; tests `apps/api/test/budget/{budget-math,budget-extraction,budget.http,budget-recovery}.spec.ts` and the memory budget repo; web `src/app/kitchen-projects/[projectId]/budget/page.tsx`, `src/components/budget/**`, `src/lib/budget/{budget-state,budget-client}.ts`, `apps/web/test/{budget-state,budget-client}.test.ts`, `apps/web/e2e/budget.spec.ts`.
- Modify: API `kitchen-projects.controller.ts`, `kitchen-projects.service.ts`, `kitchen-projects.module.ts`, `prisma/schema.prisma`, `migration.spec.ts`, login-gate HTTP tests; `ai/adapters/fake-llm.adapter.ts` (JSON mode); `packages/shared-types/src/index.ts`, `packages/api-client/{openapi.json,src/schema.ts}` (generated); web `OwnedProjectScreen.tsx`, `GenerateScreen.tsx`, `generate-state.ts`, 11 message files, `e2e/login-gate.spec.ts` (budget intent now lands on the budget page); infra `compose.yaml`, `.env.example`, `init.sh`; docs, `PROGRESS.md`, `feature_list.json`.

## Visual Design Impact

UI involved: yes. Before any UI code the orchestrator must get the design: developer opens `design/openpencil/bricomission_B2C_app.fig` in OpenPencil, confirms the `open-pencil` MCP is connected, the screen is designed and approved, then read back to `docs/design/budget-tier-computation.md` (produced by the orchestrator — the implementer must not invent layouts; UI tasks are blocked without it).

States the design must cover (English, mobile-first 390x844, DESIGN.md tokens, one primary CTA, reuse the owned-project header):
1. Queued: waiting message + position when known. 2. Running: indeterminate progress, "about a minute".
3. Succeeded, collapsed: four tier cards Luxury/High/Medium/Low, each with the tier total (locale currency) and item count.
4. Succeeded, expanded (one tier at a time): Line Items with name, SKU, unit price × quantity, computed subtotal, unit.
5. Citation on each Line Item: catalog name + page number, visually quieter than the price.
6. Totals block per tier: subtotal, VAT line ("incl. 21% VAT"), total.
7. Empty/first-run on `/budget` (auto-started or manual CTA), retry after failure, `budget_limit_reached`, `project_incomplete`, offline.
8. Owned page change: enabled "Get my budget" (drop "Budgets: available soon").
9. No tier-selection control on this feature (selection arrives with the Dossier); keep the cards non-selectable.
10. Long-label checks at 360x780 in de and fi.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update. Budget routes and `BudgetView`, `src/kitchen-projects/budget/` module layout, the extraction/verification/math split, tables and cents storage, recovery, the budget web page, the FakeLlmAdapter JSON mode.
- `AGENTS.md`: update "Kitchen Drafts"/"AI Services": budget routes and `BUDGET_*` env, `scripts/ai/budget-smoke.sh`, and that E2E/smoke need `--profile rag` embedder up plus a Catalog ingest.
- `docs/domain-model.md`: update Budget/Line Item with storage tables, lifecycle, verification and count rules; `CONTEXT.md`: Budget/Line Item notes (cents, citation data stored).
- `docs/technical-discovery.md`: update "Budget Computation" (one call, fixed queries, chunk-ref verification, cents math, VAT decision).
- `docs/user-and-access-model.md`: Budgets owner-only. `docs/risks-and-open-questions.md`: resolve the VAT question with the decision; add fake-adapter JSON and LLM-timeout entries. `DESIGN.md`: only if the read-back introduces new tokens. `CONSTRAINTS.md`: not needed (does not exist).

## Implementation Tasks

- [x] Developer answered OQ-1..OQ-5 (recommended options, 2026-11-14); [x] design read-back approved 2026-11-14 (`docs/design/budget-tier-computation.md`). UI tasks blocked until then.
- [x] Shared types + migration + schema + repository + memory repo; `budget-math.ts` unit tests (feature verification items 1 and 3).
- [x] `budget-extraction.ts` (schema, parse, chunk-text verification) with unit tests (verification item 2); `budget-prompt.ts`; the retry loop lives in `BudgetService.run`.
- [x] `FakeLlmAdapter` JSON mode; `BudgetService` + routes (501 → 202), recovery, `KitchenProjectsModule` wiring, HTTP tests (Scenarios 1-3, 5). `openapi:export`.
- [x] Web budget page + tier cards + polling + CTA/redirect changes + 11 locales + `e2e/budget.spec.ts`; login-gate E2E update.
- [x] `init.sh` line, env, `budget-smoke.sh`, real-LLM run (Scenario 7), docs, evidence; status `passing`.

## Verification Plan

Setup (orchestrator env; never sudo, never delete `bricomission_*` model volumes): `COMPOSE_PROJECT_NAME=budget-tier-computation`, `POSTGRES_PORT=5433`, `MINIO_API_PORT=9100`, `MINIO_CONSOLE_PORT=9101`, `MAILPIT_UI_PORT=8035`, `MAILPIT_SMTP_PORT=1125`, `API_PORT=3010`, `WEB_PORT=3110`, `KEYCLOAK_PORT=8185`, `LLAMA_PORT=8085`, `EMBEDDING_PORT=8091`. GPU rule: every model load runs under `flock /tmp/bricomission-gpu.lock` with `llama-server` alone (ComfyUI stopped).

- Workspace gate: `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`. Required named tests: the four feature_list items (decimal math, rejected uncited price, double-compute identity, plus the real-LLM run below as evidence); guard order incl. "409 project_incomplete runs before search and broker"; retry-exactly-once; fake JSON mode determinism; message parity; migration spec (CHECKs, HNSW index intact).
- OpenAPI: `pnpm --filter @bricomission/api openapi:export`; commit `openapi.json` + `schema.ts`.
- Stack: `./init.sh` (must pass, new 401 budgets line). E2E prerequisites: `docker compose --profile rag up -d --wait embedder` (CPU only) and `./scripts/catalog/ingest.sh infra/catalog/samples` when the index is empty; then `pnpm test:e2e` with the new `budget.spec.ts` and every existing spec green; `./scripts/keycloak-smoke.sh`.
- curl (real tokens, never printed): owner POST 202 → poll to `succeeded`; second active POST 409; Professional 403; anonymous 401; `GET budgets/:id` shows four tiers with citations. psql: `SELECT tier, subtotal_cents, vat_cents, total_cents FROM budget_tier ...` and re-sum `budget_line_item.subtotal_cents` to prove they match.
- Real LLM (verification item 4): `docker compose --profile ai up -d --wait llama-server` (leave comfyui down), `AI_ADAPTERS=local docker compose up -d --wait api`, then under `flock`: `bash scripts/ai/budget-smoke.sh` (+ `scripts/ai-spike/vram-sample.sh`). Afterwards `docker compose --profile ai stop llama-server` and `docker compose up -d --wait api` back on `fake`; stop the embedder with `docker compose --profile rag stop embedder`.
- Finish: `./init.sh` exit 0 again.

## Evidence To Capture

Test names/counts (map each feature_list verification item to test names), OpenAPI diff summary, curl statuses, psql tier totals vs re-summed line items, E2E list, `init.sh` tail, smoke output (seconds, token counts, four tier totals, VRAM peak), the design artifact path and approval date, deviations in Implementation Notes below.

## Validator Checklist

- [ ] `POST .../budget` keeps path, guards, `@Roles('user')`, no `@Public()`, 409 `project_incomplete` before search or broker; 501 `not_available_yet` is gone.
- [ ] Every LLM call goes through `broker.submit('llm', ...)`; only `AI_ADAPTERS=local` touches the GPU; tests and E2E use fake. No prompt, token counts, job id or backend body in responses or logs.
- [ ] Every Line Item price was verified against its cited chunk text; no unverified price reaches any total; totals come only from `budget-math` (integer cents, half-up); same Line Items → identical totals.
- [ ] Migration preserves the catalog HNSW index; citations survive chunk re-ingest (stored as data).
- [ ] UI matches `docs/design/budget-tier-computation.md`; four tier cards, expansion, citations; 11 locales; one primary CTA; no tier selection.
- [ ] OpenAPI drift test green; docs updated; status `passing` (not `accepted`).

## Open Questions For The Developer (ANSWERED 2026-11-14: OQ-1..OQ-5 all take the recommended option)

1. **OQ-1 VAT.** Recommended: Catalog retail prices are VAT-inclusive (Spanish retail convention), `BUDGET_VAT_PERCENT=21`, UI shows subtotal, VAT amount and "incl. VAT" total. Alternatives: (a) VAT-excluded pricing with VAT added on top; (b) hide VAT until `admin-service-endpoints` makes the rate configurable. This settles the open line in `docs/risks-and-open-questions.md` for Budget (the Contract PDF VAT stays later).
2. **OQ-2 One call or four.** Recommended: one LLM call for all four tiers (fits the 120 s job timeout, one shared chunk set, cross-tier comparison possible). Alternative: per-tier calls (needs a longer `GPU_BROKER_LLM_TIMEOUT_MS`, ~4x prompt re-embedding, ~4x GPU seconds).
3. **OQ-3 Regeneration policy.** Recommended: Budget history like Renders, one active, max `BUDGET_MAX_PER_PROJECT=5`. Alternative: one Budget per project replaced in place (loses the comparison demo for the video).
4. **OQ-4 Budget entry after claim.** Recommended: mirror renders — `intent=budget` claim lands on `/kitchen-projects/<id>/budget?claimed=1&start=1` and auto-computes. Alternative: stay on the owned page and let the Homeowner press "Get my budget".
5. **OQ-5 Fake adapter JSON mode (Decision 7).** Recommended as written (deterministic, derived from prompt chunks; needed for the fake stack, E2E and the offline demo). Alternative: E2E only asserts the `failed` path with the current fake (rejects: the demo path needs four tiers on the fake stack).

## Implementation Notes (implementer)

Deviations and decisions taken during implementation (2026-11-14):

1. **Tier amounts.** `BudgetTierView.subtotalCents` is the part **before VAT** (`total - vat`), `totalCents` is the sum of the Line Item subtotals, so `subtotal + vat = total` always holds (CHECK in the migration). The design's totals block ("Subtotal (before VAT)", "VAT 21%", "Total (VAT included)") then renders three API fields with no arithmetic in the page. Decision 4 spelled the inclusive case as "gross = subtotal"; the stored/returned names follow the design instead.
2. **At most 5 items per tier, not 8.** The first real-LLM run with 8 items, long bilingual names and pretty-printed JSON used the whole 1800-token cap (finish `length`, 70 s) and the retry ran into the 120 s broker timeout. Now: schema `maxItems` 5, name `maxLength` 80, prompt asks for the English name only (6 words), `maxTokens` 1500. Measured: 38.2 s and 55.7 s, 1 attempt, 900-1428 completion tokens.
3. **Retry rule.** A retry happens whenever the attempt is not well formed or any tier has no verified Line Item (a superset of "every item rejected"); the next attempt gets the feedback message. Fewer attempts than `BUDGET_MAX_ATTEMPTS` = 2 are never exceeded. The last attempt must give four non-empty tiers, else `failed` / `verification_failed`.
4. **Verification is per SKU line.** The SKU must appear in the cited chunk and the quoted price must be a number printed on a line that carries that SKU (so 129.00 quoted for `BM-SYN-CAB-040` fails even though the chunk prints 129.00 for another SKU). Only when the SKU lines print no decimal price at all does a price anywhere in the chunk count. Numbers are compared as cents (`189.9` = `189,90` = `189.90 EUR`). The chunk text comes from the retrieval result (identical to `catalog_chunk.text`), kept in memory for the job.
5. **Tiers as object keys** in the JSON Schema (`tiers.luxury.items[]` ...) instead of an array of `{tier, items}`: the grammar then forces all four tiers.
6. **HTTP tests stub `CatalogSearchService`** (returns the sample Catalog's real pipe-table lines) instead of FakeEmbedder + memory repository; the real pgvector/embedder path is covered by `scripts/ai/budget-smoke.sh`, the E2E and the psql checks.
7. **Web.** `startPolling`/`isActive` in `render-state.ts` became generic (`{status}`) so the Budget page reuses them; the history strip is a row of "Budget N" chips (the design gave no thumbnail for a Budget) shown from two succeeded Budgets; the owned page's "Get my budget" link needs the project to be loaded (otherwise the disabled button stays). The claim landing for intent `budget` changed, so `e2e/login-gate.spec.ts` now follows the Budget page and opens the owned page by URL (`?claimed=1`).
8. **Bug caught only by the real database run:** the first `markSucceeded` passed `quantityHundredths` to Prisma (validation error, `adapter_error`) although the in-memory repository accepted it. The Prisma repository now maps every column explicitly; `budget-smoke.sh` (psql recompute) is the guard.
9. `KitchenProjectErrorCode` lost `not_available_yet`; `Costly()`, `requestCostlyAction` and `CostlyAction` were removed. The sample Catalog's cover still says "VAT excluded" (test data; recorded in the risks table).
10. **Validator fix (ADR 0002):** the SKU token is stripped from a Catalog line before its numbers are read, and when the line prints a decimal-formatted price only decimal-formatted numbers count, so `300` no longer verifies against `BM-SYN-WTP-300 ... 300 cm` nor `600` against `BM-SYN-CAB-060 ... 600 mm`. The no-decimal-price fallback is unchanged. Regression test in `budget-extraction.spec.ts`.
