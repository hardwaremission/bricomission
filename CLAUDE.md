# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

Pre-code, end of Phase 2. Discovery docs and the startup harness (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`) exist; there is no application code yet. `AGENTS.md` is the operational source of truth.

- `Documentación del Proyecto_BricoMission.md`: full project definition (Spanish, versioned; no date prefix in the name). Section 1.4 holds the measured dev hardware and local-model limits; section 3 is the English PRD that feeds `/build-brief` (PRD §8 = demo video production); section 4.2 is the phase plan (Phases 0-5); section 5 is the presentation pipeline.
- Commands will come from `/harness-starter` (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`). `init.sh` (bash) is the entry point and should bring up/verify the Docker Compose stack. Once `AGENTS.md` exists it is the operational source of truth and this file should import it (`@AGENTS.md`).

MVP deadline: 2026-11-22 (15-minute demo video).

## Workflow (Spec-Driven Development via DevExpert harness)

Skills in `.claude/skills/` (from `devexpert-io/ai-expert-project`), subagents in `.claude/agents/`.

0. Git local config + GitHub MCP — done.
1. `/build-brief` — done (2026-11-12). Outputs: `CONTEXT.md`, `DESIGN.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/adr/0001-0003`. Read these before any feature work.
2. `/harness-starter` — done (2026-11-12): 34 features; next ready `infra-compose-core` (needs Docker installed), then `local-ai-gpu-spike`. Phase 3 (`/feature-flow`) is next: splits the MVP into 12-30 single-session features in `feature_list.json` with `depends_on`.
3. `/feature-flow <feature-id>`: the main agent orchestrates the subagents sequentially, never in parallel for one feature: `planner` (preloads `feature-spec`, may write only `docs/specs/` and `feature_list.json`) -> `implementer` (`feature-implementer`, self-verifies, marks `passing`) -> `validator` (`feature-validator`, read-only, verdict accept/revise/block). `revise` loops back to the implementer. Only the orchestrator marks `accepted` and commits; subagents never commit.
4. `/github-flow plan|execute|publish`: one worktree per feature at `../hardwaremission.bricomission-worktrees/<feature-id>`, branch `feature/<feature-id>`, issue `[<feature-id>] <title>`, PR per accepted feature. Adapted to this repo: GitHub MCP instead of `gh`, one headless `claude -p` session per worktree (hooks disabled, `COMPOSE_PROJECT_NAME=<feature-id>`). Push needs explicit per-run permission. Never merge PRs.
5. Demo video, only after the MVP (doc section 5): agent proposes the script -> developer records narration -> local speech-to-text (Whisper) gives per-sentence timestamps -> screenshots via the browser MCP -> HyperFrames project in `presentation/hyperframes/` (1920x1080) synced to the transcript -> developer validates the preview -> guided render to MP4 (`presentation/out/`, git-ignored). Everything else under `presentation/` is versioned.

## Hard rules

- All code, identifiers, commits, and technical docs in English. Conversation with the developer is in Spanish.
- Linux host (CachyOS). Scripts are bash `.sh`; never generate `.ps1`.
- Infrastructure runs in Docker containers via Docker Compose v2 (`compose.yaml` at the repo root) whenever possible: PostgreSQL, Keycloak, MinIO, LLM server, ControlNet service. Pinned image versions, named volumes, healthchecks. Anything left native needs a written justification. The demo must work fully offline.
- GPU budget: ~14.5 GB free VRAM. Never assume the LLM and the image model are co-resident; serialize GPU loads (see doc §1.4 / PRD hardware constraints).
- Git identity and credentials are repository-local (`HardwareMission`, GitHub noreply email). Never read or use global git config or global credentials, never use `gh`. `git fetch`/`git push` authenticate through the local credential helper with the `BRICOMISSION_GITHUB_PAT` env var (same token as the `github` MCP server in `.mcp.json`); run them with `GIT_TERMINAL_PROMPT=0`. The token is a fine-grained PAT scoped to `hardwaremission/bricomission` (Contents, Issues, Pull requests).
- Commits are made with local git; the GitHub MCP is for remote work (issues, PRs). Never use MCP tools that write commits (`push_files`, `create_or_update_file`) or merge.
- At least these three roles, mandatory: User (B2C homeowner), Professional (B2B, grouped by Company, pending until Admin validates CIF; full rights on own projects, read-only on co-workers'), Administrator (100% visual admin panel: user CRUD, professional validation, token quotas with per-user override/reset, AI endpoint and MinIO credential config, payment mode toggle simulated/PayPal Sandbox).
- No UI guessing. For any new or changed screen: ask the developer to open the matching `.fig` under `design/openpencil/` (e.g. `bricomission_B2C_app.fig`, `bricomission_B2B_dashboard.fig`) in OpenPencil, wait for explicit confirmation that the MCP is connected, design through the `open-pencil` MCP (not the `pencil`/pen.dev server), iterate until approved, then read the design back via MCP and implement strictly from it.

## Intended architecture (from the PRD, not yet built)

- Mobile-first PWA (Next.js + Tailwind) over a framework-agnostic REST API that a future native iOS app will reuse unchanged.
- Keycloak realm `BricoMission` owns auth, RBAC, SSO, OTP. Lazy login: anonymous until the first costly AI call.
- PostgreSQL (container) for data; MinIO as S3-compatible storage for photos, generated images, PDFs.
- pnpm TypeScript monorepo: `apps/web` (Next.js + Tailwind PWA), `apps/api` (NestJS REST + OpenAPI, Prisma, SSE). ADR 0003.
- AI abstraction layer with hot-swappable endpoints: llama.cpp `llama-server` in Docker with a MoE model, experts in system RAM (ADR 0001); ComfyUI SDXL + ControlNet (Depth/Canny) preserving room geometry; cloud fallback.
- Budgeting is conversational: UI controls inject structured prompts into the LLM chat; four tiers (Luxury/High/Medium/Low); four switchable personas. Prices come from a local RAG index (pgvector) over catalog PDFs; LLM extracts cited Line Items, code verifies and computes every amount (ADR 0002).
- Online with offline fallback: Google SSO / PayPal Sandbox online; Keycloak password + email OTP (Mailpit) / simulated payment offline.
- Marketplace: locked dossier, 15-day anonymous sealed bidding, no chat, SSE notifications, PDF contract with computed delay penalties and platform commission.
- i18n from day one: en, es, fr, de, it, pt, nl, sv, no, da, fi; browser detection, choice persisted per user.

Discovery questions were settled on 2026-11-12; remaining unknowns and risks live in `docs/risks-and-open-questions.md` (Day-1 GPU spike first).

Host state (2026-11-12): CachyOS, kernel 7.3.3-1-cachyos; Ryzen 9 5950X (16C/32T, AVX2), 64 GB RAM + zram swap; Radeon RX 9070 XT 16 GB (RADV/Vulkan works, no host ROCm); 465 GB system NVMe plus unmounted 1.8 TB / 4 TB NVMe data drives. Installed: git, python3 3.14, ffmpeg, Node 26 + npm. Missing: Docker + Compose (everything else goes in containers).

## Repository tooling

- `.mcp.json`: `github` remote MCP server (`https://api.githubcopilot.com/mcp`), token via `${BRICOMISSION_GITHUB_PAT}`, no secrets in the file. Changing the env var requires a full terminal restart.
- `.claude/hooks/exportar_conversacion.py` (Stop, UserPromptSubmit and SessionEnd hooks, `.claude/settings.json`; UserPromptSubmit catches the previous turn's final answer, which Stop can miss): rewrites `docs/<yyyy-mm-dd>_conversacion_completa.md` on every turn, one file per local day, starting at session `53ca36f2-...`. The file always shows as modified in `git status`; include it in commits. Never paste secrets in chat: they would land in these versioned files.
