# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-code, end of Phase 0. The repository holds the product definition, agent tooling and the DevExpert harness; there is no application code and no build, lint, or test commands yet.

- `2026-11-06_11.27_Documentación del Proyecto_BricoMission.md`: full project definition (Spanish). Section 3 is the English PRD that feeds `/build-brief`; section 4.2 is the phase plan.
- Commands will come from `/harness-starter` (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`). The skill only generates `init.sh`: also produce an equivalent `init.ps1`, which is the one the developer runs. Once `AGENTS.md` exists it is the operational source of truth and this file should import it (`@AGENTS.md`).

MVP deadline: 2026-11-22 (15-minute demo video).

## Workflow (Spec-Driven Development via DevExpert harness)

Skills in `.claude/skills/` (from `devexpert-io/ai-expert-project`), subagents in `.claude/agents/`.

0. Git local config + GitHub MCP — done.
1. `/build-brief` — next. Discovery interview, one question at a time; produces `CONTEXT.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/risks-and-open-questions.md`, `DESIGN.md`. No code.
2. `/harness-starter`: splits the MVP into 12-30 single-session features in `feature_list.json` with `depends_on`.
3. `/feature-flow <feature-id>`: the main agent orchestrates the subagents sequentially, never in parallel for one feature: `planner` (preloads `feature-spec`, may write only `docs/specs/` and `feature_list.json`) -> `implementer` (`feature-implementer`, self-verifies, marks `passing`) -> `validator` (`feature-validator`, read-only, verdict accept/revise/block). `revise` loops back to the implementer. Only the orchestrator marks `accepted` and commits; subagents never commit.
4. `/github-flow plan|execute|publish`: one worktree per feature at `../hardwaremission.bricomission-worktrees/<feature-id>`, branch `feature/<feature-id>`, issue `[<feature-id>] <title>`, PR per accepted feature. Adapted to this repo: GitHub MCP instead of `gh`, one headless `claude -p` session per worktree (hooks disabled). Push needs explicit per-run permission. Never merge PRs.

## Hard rules

- All code, identifiers, commits, and technical docs in English. Conversation with the developer is in Spanish.
- Windows host. Every script needs a PowerShell `.ps1` version; the developer runs only `.ps1`.
- No Docker. PostgreSQL, Keycloak, MinIO, Ollama run natively on the host; the demo must work fully offline.
- Git identity and credentials are repository-local (`HardwareMission`, GitHub noreply email). Never read or use global git config or global credentials, never use `gh`. `git fetch`/`git push` authenticate through the local credential helper with the `BRICOMISSION_GITHUB_PAT` env var (same token as the `github` MCP server in `.mcp.json`); run them with `GIT_TERMINAL_PROMPT=0`. The token is a fine-grained PAT scoped to `hardwaremission/bricomission` (Contents, Issues, Pull requests).
- Commits are made with local git; the GitHub MCP is for remote work (issues, PRs). Never use MCP tools that write commits (`push_files`, `create_or_update_file`) or merge.
- At least these three roles, mandatory: User (B2C homeowner), Professional (B2B, grouped by Company, pending until Admin validates CIF; full rights on own projects, read-only on co-workers'), Administrator (100% visual admin panel: user CRUD, professional validation, token quotas with per-user override/reset, AI endpoint and MinIO credential config, payment mode toggle simulated/PayPal Sandbox).
- No UI guessing. For any new or changed screen: ask the developer to open the matching `.fig` under `design/openpencil/` (e.g. `bricomission_B2C_app.fig`, `bricomission_B2B_dashboard.fig`) in OpenPencil, wait for explicit confirmation that the MCP is connected, design through the `open-pencil` MCP (not the `pencil`/pen.dev server), iterate until approved, then read the design back via MCP and implement strictly from it.

## Intended architecture (from the PRD, not yet built)

- Mobile-first PWA (Next.js + Tailwind) over a framework-agnostic REST API that a future native iOS app will reuse unchanged.
- Keycloak realm `BricoMission` owns auth, RBAC, SSO, OTP. Lazy login: anonymous until the first costly AI call.
- PostgreSQL (native) for data; MinIO as S3-compatible storage for photos, generated images, PDFs.
- AI abstraction layer with hot-swappable endpoints (Ollama / lemonade-server locally on an AMD Radeon 9070 XT 16 GB, cloud fallback). Image generation via ControlNet (Depth/Canny) preserving room geometry.
- Budgeting is conversational: UI controls inject structured prompts into the LLM chat; four tiers (Luxury/High/Medium/Low); four switchable personas. Prices grounded on partner catalogs (NotebookLM-curated), never invented.
- Marketplace: locked dossier, 15-day anonymous sealed bidding, no chat, SSE notifications, PDF contract with computed delay penalties and platform commission.
- i18n from day one: en, es, fr, de, it, pt, nl, sv, no, da, fi; browser detection, choice persisted per user.

Known open questions to settle in `/build-brief` (offline demo vs SSO/PayPal/NotebookLM, NotebookLM has no runtime query API, deterministic budget math, ControlNet on RDNA4/Windows, VRAM sharing, MinIO community binaries) were raised at the start of the 2026-11-06 session log.

Host state (2026-11-06): installed git, Node 24, Python 3.14, Ollama; not found on PATH: PostgreSQL, Java (Keycloak needs JDK 21), MinIO.

## Repository tooling

- `.mcp.json`: `github` remote MCP server (`https://api.githubcopilot.com/mcp`), token via `${BRICOMISSION_GITHUB_PAT}`, no secrets in the file. Changing the env var requires a full terminal restart.
- `.claude/hooks/exportar_conversacion.py` (Stop hook, `.claude/settings.json`): rewrites `docs/<yyyy-mm-dd>_conversacion_completa.md` on every turn, one file per local day, starting at session `53ca36f2-...`. The file always shows as modified in `git status`; include it in commits. Never paste secrets in chat: they would land in these versioned files.
