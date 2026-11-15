# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

Scope update (2026-11-15): the MVP delivered to the tutors is the 16 features already `accepted` in `feature_list.json` plus one new feature, `diagnostics-dashboard`, which closes the MVP (a separate desktop web with a live blueprint-style graph of the whole architecture). The other 22 features carry `"phase": "phase-2"` and are OUT of the MVP (next phase, outside the project presented to the tutors): marketplace, bidding, contracts, payments, quotas, the Admin panel, budget chat and personas, DIY PDF, Google SSO, per-account language preference and render declutter. Details: `Documentación del Proyecto_BricoMission.md`, section "Alcance del MVP".

History: this file was written pre-code, at the end of Phase 2 (discovery docs and startup harness only); application code now exists. `AGENTS.md` is the operational source of truth.

- `Documentación del Proyecto_BricoMission.md`: full project definition (Spanish, versioned; no date prefix in the name). Section 1.4 holds the measured dev hardware and local-model limits; section 3 is the English PRD that feeds `/build-brief` (PRD §8 = demo video production); section 4.2 is the phase plan (Phases 0-5); section 5 is the presentation pipeline.
- Commands will come from `/harness-starter` (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`). `init.sh` (bash) is the entry point and should bring up/verify the Docker Compose stack. Once `AGENTS.md` exists it is the operational source of truth and this file should import it (`@AGENTS.md`).

MVP deadline: 2026-11-22 (15-minute demo video: the app in a portrait browser next to the diagnostics dashboard in a desktop browser).

## Workflow (Spec-Driven Development via DevExpert harness)

Skills in `.claude/skills/` (from `devexpert-io/ai-expert-project`), subagents in `.claude/agents/`.

0. Git local config + GitHub MCP — done.
1. `/build-brief` — done (2026-11-12). Outputs: `CONTEXT.md`, `DESIGN.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/adr/0001-0003`. Read these before any feature work.
2. `/harness-starter` — done (2026-11-12): 34 features; next ready `infra-compose-core` (needs Docker installed), then `local-ai-gpu-spike`. Phase 3 (`/feature-flow`) splits the work into single-session features in `feature_list.json` with `depends_on`. Since 2026-11-15 each feature may carry `"phase": "phase-2"`; the startup picks only features without it (MVP).
3. `/feature-flow <feature-id>`: the main agent orchestrates the subagents sequentially, never in parallel for one feature: `planner` (preloads `feature-spec`, may write only `docs/specs/` and `feature_list.json`) -> `implementer` (`feature-implementer`, self-verifies, marks `passing`) -> `validator` (`feature-validator`, read-only, verdict accept/revise/block). `revise` loops back to the implementer. Only the orchestrator marks `accepted` and commits; subagents never commit.
4. `/github-flow plan|execute|publish`: no worktrees. Branch `feature/<feature-id>` is created from the freshly pulled `main` and checked out in this checkout, issue `[<feature-id>] <title>`, PR per accepted feature. Strictly sequential: one feature in flight; the next starts only after the developer merges the previous PR (avoids merge conflicts on shared files). Adapted to this repo: GitHub MCP instead of `gh`; planner/implementer/validator run as subagents of the orchestrator's session on the feature branch, default Compose project and ports, no Remote Control. Push needs explicit per-run permission. Never merge PRs. After the developer confirms the merge: back to `main`, `git pull --ff-only`, delete the merged local and remote `feature/*` branches.
5. Demo video, only after the MVP, i.e. after `diagnostics-dashboard` (doc section 5; scenes that depend on phase 2 features are dropped, replaced by the diagnostics narration): agent proposes the script -> developer records narration -> local speech-to-text (Whisper) gives per-sentence timestamps -> screenshots via the browser MCP -> HyperFrames project in `presentation/hyperframes/` (1920x1080) synced to the transcript -> developer validates the preview -> guided render to MP4 (`presentation/out/`, git-ignored). Everything else under `presentation/` is versioned.

## Hard rules

- All code, identifiers, commits, and technical docs in English. Conversation with the developer is in Spanish.
- Linux host (CachyOS). Scripts are bash `.sh`; never generate `.ps1`.
- Infrastructure runs in Docker containers via Docker Compose v2 (`compose.yaml` at the repo root) whenever possible: PostgreSQL, Keycloak, MinIO, LLM server, ControlNet service. Pinned image versions, named volumes, healthchecks. Anything left native needs a written justification. The demo must work fully offline.
- GPU budget: ~14.5 GB free VRAM. Never assume the LLM and the image model are co-resident; serialize GPU loads (see doc §1.4 / PRD hardware constraints).
- Git identity and credentials are repository-local (`HardwareMission`, GitHub noreply email). Never read or use global git config or global credentials, never use `gh`. `git fetch`/`git push` authenticate through the local credential helper with the `BRICOMISSION_GITHUB_PAT` env var (same token as the `github` MCP server in `.mcp.json`); run them with `GIT_TERMINAL_PROMPT=0`. The token is a fine-grained PAT scoped to `hardwaremission/bricomission` (Contents, Issues, Pull requests).
- Commits are made with local git; the GitHub MCP is for remote work (issues, PRs). Never use MCP tools that write commits (`push_files`, `create_or_update_file`) or merge.
- Three roles are DEFINED and seeded in the Keycloak realm (scope decision 2026-11-15: the roles exist, their functionality is phase 2): User (B2C homeowner), Professional (B2B, grouped by Company, pending until Admin validates CIF; full rights on own projects, read-only on co-workers'), Administrator (the Administrator can already read the admin-only platform setting API). The Professional and Administrator functions are phase 2 and not built: marketplace, bidding, CIF validation, 100% visual admin panel (user CRUD, professional validation, token quotas with per-user override/reset, AI endpoint and MinIO credential config, payment mode toggle simulated/PayPal Sandbox), contracts. The original rule listed them as mandatory MVP items; do not claim them as built.
- No UI guessing. For any new or changed screen: ask the developer to open the matching `.fig` under `design/openpencil/` (e.g. `bricomission_B2C_app.fig`, `bricomission_B2B_dashboard.fig`; the diagnostics dashboard uses `bricomission_diagnostics.fig`) in OpenPencil, wait for explicit confirmation that the MCP is connected, design through the `open-pencil` MCP (not the `pencil`/pen.dev server), iterate until approved, then read the design back via MCP and implement strictly from it.

## Intended architecture (from the PRD; items marked [phase 2] are out of the delivered MVP and not built)

- Mobile-first PWA (Next.js + Tailwind) over a framework-agnostic REST API that a future native iOS app will reuse unchanged.
- Keycloak realm `BricoMission` owns auth, RBAC, SSO, OTP. Lazy login: anonymous until the first costly AI call.
- PostgreSQL (container) for data; MinIO as S3-compatible storage for photos, generated images, PDFs.
- pnpm TypeScript monorepo: `apps/web` (Next.js + Tailwind PWA), `apps/api` (NestJS REST + OpenAPI, Prisma, SSE). ADR 0003.
- AI abstraction layer with hot-swappable endpoints: llama.cpp `llama-server` in Docker with a MoE model, experts in system RAM (ADR 0001); ComfyUI SDXL + ControlNet (Depth/Canny) preserving room geometry; cloud fallback.
- Budgeting is conversational: UI controls inject structured prompts into the LLM chat; four tiers (Luxury/High/Medium/Low); four switchable personas [phase 2: chat, macros and personas]. Prices come from a local RAG index (pgvector) over catalog PDFs; LLM extracts cited Line Items, code verifies and computes every amount (ADR 0002).
- Online with offline fallback: Google SSO / PayPal Sandbox online [phase 2]; Keycloak password + email OTP (Mailpit) offline (MVP); simulated payment [phase 2].
- Marketplace [phase 2]: locked dossier, 15-day anonymous sealed bidding, no chat, SSE notifications, PDF contract with computed delay penalties and platform commission.
- i18n from day one: en, es, fr, de, it, pt, nl, sv, no, da, fi; browser detection, choice persisted per user [phase 2: persistence per account].
- Diagnostics dashboard (MVP, closes it; built and `accepted` 2026-11-15, ADR 0006): separate localhost-only desktop web on its own port (`DIAGNOSTICS_PORT` 3200) and Compose profile `diagnostics`, no login, live blueprint-style graph of every container and API module with animated connections, narrated log panel and CPU/RAM/VRAM/GPU widgets.

Discovery questions were settled on 2026-11-12; remaining unknowns and risks live in `docs/risks-and-open-questions.md` (Day-1 GPU spike first).

Host state (2026-11-12): CachyOS, kernel 7.3.3-1-cachyos; Ryzen 9 5950X (16C/32T, AVX2), 64 GB RAM + zram swap; Radeon RX 9070 XT 16 GB (RADV/Vulkan works, no host ROCm); 465 GB system NVMe plus unmounted 1.8 TB / 4 TB NVMe data drives. Installed: git, python3 3.14, ffmpeg, Node 26 + npm. Missing: Docker + Compose (everything else goes in containers).

## Repository tooling

- `.mcp.json`: `github` remote MCP server (`https://api.githubcopilot.com/mcp`), token via `${BRICOMISSION_GITHUB_PAT}`, no secrets in the file. Changing the env var requires a full terminal restart.
- `.claude/hooks/exportar_conversacion.py` (Stop, UserPromptSubmit and SessionEnd hooks, `.claude/settings.json`; UserPromptSubmit catches the previous turn's final answer, which Stop can miss): rewrites `docs/<yyyy-mm-dd>_conversacion_completa.md` on every turn, one file per local day, starting at session `53ca36f2-...`. The file always shows as modified in `git status`; include it in commits. Never paste secrets in chat: they would land in these versioned files.
