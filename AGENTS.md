# Project Agent Instructions

BricoMission is an AI-powered kitchen renovation platform: homeowners turn photos and measurements into photorealistic renders and catalog-grounded budgets, then go DIY or publish a locked dossier to an anonymous marketplace of validated contractors. MVP deadline: 2026-11-22.

## Read First

- `CONTEXT.md` — domain language (use these terms in code and docs).
- `docs/build-brief.md` — goals, non-goals, MVP priority order.
- `docs/domain-model.md` — entities, relationships, lifecycles.
- `docs/risks-and-open-questions.md` — risks and unresolved questions.

Read when relevant:

- `docs/user-and-access-model.md` — roles, permissions, anonymity, revocation.
- `docs/technical-discovery.md` — stack, Compose services, integrations, GPU serialization, testing.
- `docs/adr/` — accepted decisions (0001 local MoE LLM, 0002 deterministic budget math, 0003 monorepo).
- `DESIGN.md` — visual tokens and UI rules, for any UI work.
- `Documentación del Proyecto_BricoMission.md` — full project definition and PRD (section 3), phase plan (4.2), discovery decisions (4.3), demo video pipeline (5).

## Startup Workflow

Before writing code:

1. Confirm the working directory with `pwd`.
2. Read `PROGRESS.md` for current verified state and next step.
3. Read `feature_list.json` and pick the first ready unfinished feature in list order (all `depends_on` accepted).
4. Run `./init.sh`. If it reports Docker missing or the daemon unreachable, ask the developer to run `./scripts/install-host-prereqs.sh` in their own terminal (it uses sudo) and re-login. Agents never run the install mode or `sudo`; they only run `./scripts/install-host-prereqs.sh --check`.
5. If baseline verification fails, fix the baseline before adding new feature work.

## Working Rules

- One feature at a time. Keep changes inside its scope.
- Code, identifiers, commits, and technical docs in English. Talk to the developer in Spanish.
- Linux host: scripts are bash `.sh` only.
- Infrastructure runs in Docker Compose v2 (`compose.yaml` at repo root), pinned image tags, named volumes, healthchecks. Anything native needs a written justification.
- GPU: ~14.5 GB free VRAM. Never assume the LLM and the image model are co-resident; go through the API GPU job broker.
- Never let the LLM produce an amount: it extracts cited Line Items, code computes (ADR 0002).
- UI gate: for any new or changed screen, ask the developer to open the matching `.fig` in `design/openpencil/` in OpenPencil, wait for confirmation that the `open-pencil` MCP is connected, design through it, iterate until approved, then implement strictly from the design read back via MCP.
- Do not mark a feature done just because code exists. Do not silently change verification rules.
- Git: repository-local identity only, never `gh`, never merge PRs. Subagents never commit.

## AI Services

- The local AI stack is opt-in and GPU-bound, so `./init.sh` never starts it.
  - Download the weights once: `docker compose --profile ai-fetch run --rm ai-fetch` (about 30 GB into named volumes; idempotent).
  - Start: `docker compose --profile ai up -d --wait` (`llama-server` on `LLAMA_PORT` 8080, `comfyui` on `COMFYUI_PORT` 8188, both on 127.0.0.1).
  - Stop: `docker compose --profile ai stop llama-server comfyui` (name the services: a bare `--profile ai stop/down` also stops the core stack).
- Measured on 2026-11-12: serialization required. The LLM uses about 3.2 GB of VRAM; ComfyUI fills the card (about 15 GB) during a render. Run renders alone. Free VRAM with ComfyUI `POST /free` or `docker compose stop llama-server`. Numbers: `docs/spikes/local-ai-gpu-spike.md`.
- Spike tools: `scripts/ai-spike/{llm-bench,comfy-run,vram-sample}.sh`.

## Required Artifacts

- `feature_list.json`: source of truth for feature state (`not_started`, `in_progress`, `blocked`, `passing`, `accepted`).
- `PROGRESS.md`: current verified state and session log.
- `init.sh`: standard startup and verification path.

## Definition Of Done

A feature is done only when all are true:

- target behavior is implemented,
- required verification actually ran,
- evidence is recorded in `feature_list.json` or `PROGRESS.md`,
- the repository restarts cleanly with `./init.sh`,
- docs are updated if product behavior, domain rules, API, or verification changed.

Only the `/feature-flow` orchestrator marks `accepted`, after the independent validator's `accept`.

## End Of Session

1. Update `PROGRESS.md`.
2. Update `feature_list.json`.
3. Record unresolved risks or blockers.
4. Leave the repo ready for `./init.sh`.
