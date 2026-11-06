# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-code. The repository currently holds only the product definition: `2026-11-06_11.27_Documentación del Proyecto_BricoMission.md` (Spanish; section 3 is the English PRD). There are no build, lint, or test commands yet. They will be defined by the DevExpert harness (`harness-starter` generates `AGENTS.md`, `init.ps1`, `PROGRESS.md`, `feature_list.json`). Once `AGENTS.md` exists, it is the operational source of truth and this file should import it (`@AGENTS.md`).

MVP deadline: 2026-11-22 (15-minute demo video).

## Workflow (Spec-Driven Development via DevExpert harness)

Phases, in order (section 4.2 of the project document):
0. Git local config + GitHub MCP — done.
1. `/build-brief`: discovery interview, produces `CONTEXT.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/risks-and-open-questions.md`, `DESIGN.md`. No code.
2. `/harness-starter`: splits the MVP into 12-30 single-session features in `feature_list.json`.
3. `/feature-flow <feature-id>`: planner (`feature-spec`, writes `docs/specs/<id>.md`) -> implementer (`feature-implementer`, marks `passing`) -> independent validator (`feature-validator`, verdict accept/revise/block). Only an accept moves a feature to `accepted`; the implementer never marks `accepted`.
4. `/github-flow plan|execute|publish`: one git worktree per feature at `../hardwaremission.bricomission-worktrees/<feature-id>`, branch `feature/<feature-id>`, PR per accepted feature. Never merge PRs; merging is the developer's decision.

The harness skills are not installed yet; they come from the course repository `ai-expert-project`.

## Hard rules

- All code, identifiers, commits, and technical docs in English. Conversation with the developer is in Spanish.
- Windows host. Every script needs a PowerShell `.ps1` version; the developer runs only `.ps1` (e.g. `init.ps1`, not `init.sh`).
- No Docker. PostgreSQL, Keycloak, MinIO, Ollama run natively on the host; the demo must work fully offline.
- Git identity and credentials are repository-local. Never read or use global git config or global credentials. `git push` authenticates through the local credential helper with the `BRICOMISSION_GITHUB_PAT` env var (same token as the GitHub MCP in `.mcp.json`). Do not use `gh`.
- Commits are made with local git; the GitHub MCP is for remote work (issues, branches, PRs).
- At least these three roles, mandatory: User (B2C homeowner), Professional (B2B, grouped by Company, pending until Admin validates CIF; full rights on own projects, read-only on co-workers'), Administrator (100% visual admin panel: user CRUD, professional validation, token quotas with per-user override/reset, AI endpoint and MinIO credential config, payment mode toggle simulated/PayPal Sandbox).
- No UI guessing. For any new or changed screen: ask the developer to open the matching `.fig` under `design/openpencil/` (e.g. `bricomission_B2C_app.fig`, `bricomission_B2B_dashboard.fig`) in OpenPencil, wait for explicit confirmation that the MCP is connected, design through the `open-pencil` MCP (not the `pencil`/pen.dev server), iterate until approved, then read the design back via MCP and implement strictly from it.

## Intended architecture (from the PRD, not yet built)

- Mobile-first PWA (Next.js + Tailwind) over a framework-agnostic REST API that a future native iOS app will reuse unchanged.
- Keycloak realm `BricoMission` owns auth, RBAC, SSO, OTP.
- PostgreSQL (native) for data; MinIO as S3-compatible storage for photos, generated images, PDFs.
- AI abstraction layer (AI SDK / LiteLLM) with hot-swappable endpoints (Ollama / lemonade-server locally on an AMD Radeon 9070 XT, cloud fallback). Image generation via ControlNet (Depth/Canny) preserving room geometry.
- Budgeting is conversational: UI controls inject structured prompts into the LLM chat; four tiers (Luxury/High/Medium/Low); four switchable personas. Prices grounded on partner catalogs (NotebookLM-curated), never invented.
- Marketplace: locked dossier, 15-day anonymous sealed bidding, no chat, SSE notifications, PDF contract with computed delay penalties and platform commission.
- i18n from day one: en, es, fr, de, it, pt, nl, sv, no, da, fi; browser detection, choice persisted per user.

## Repository tooling

- `.claude/hooks/exportar_conversacion.py` (Stop hook): exports the conversation to `docs/<yyyy-mm-dd>_conversacion_completa.md`, one file per local day, starting at session `53ca36f2-...`. Never paste secrets in chat: they would land in these versioned files.
