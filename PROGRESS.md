# Progress Log

## Current Verified State

- Repository root: `/home/juanmi/Proyectos/hardwaremission.bricomission`
- Standard startup path: `./init.sh`
- Standard verification path: `./init.sh` checks host prerequisites, validates `feature_list.json`, then runs the compose gate (`docker compose up -d --wait`; postgres, minio, mailpit healthy). Without Docker it skips the gate and exits 0; with an unreachable daemon it exits 1. `pnpm -r lint && pnpm -r test` joins after `api-skeleton`.
- Last accepted feature: `infra-compose-core` (validator ACCEPT, 2026-11-12)
- Current next ready feature: `local-ai-gpu-spike` (also ready: `api-skeleton`)
- Current blockers: none for infra. pnpm not installed (enable with `corepack enable` during `api-skeleton`). Agent shells started before the docker group was added must run docker through `newgrp docker` (no `sg` on this host).
- Last verified at: 2026-11-12 (`./init.sh` exit 0 with the stack healthy; feature list valid)

## Session Log

### Session 001

- Date: 2026-11-12
- Goal: Create the minimal startup harness (Phase 2, `/harness-starter`).
- Completed: `AGENTS.md`, `init.sh` (pre-bootstrap variant, bash), `PROGRESS.md`, `feature_list.json` (34 features ordered by the demo path: infrastructure -> capture -> AI -> outcomes -> marketplace -> admin -> breadth).
- Verification run: JSON validation script (required fields, unique ids, existing non-self dependencies, no forward references), `chmod +x init.sh`, `./init.sh`.
- Evidence captured: `features: 34 OK, deps acyclic and ordered`; `./init.sh` reported git, node 26, python3, ffmpeg, GPU devices OK; pnpm, docker, docker compose missing.
- Files or artifacts updated: `AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`, `CLAUDE.md` (imports `AGENTS.md`), project doc phase status.
- Known risk or unresolved issue: full PRD scope (34 features) by 2026-11-22; GPU stack on RDNA4 unproven until `local-ai-gpu-spike`.
- Next best step: install Docker, then `/feature-flow infra-compose-core`, followed immediately by `local-ai-gpu-spike`.

### Session 002

- Date: 2026-11-12
- Goal: implement `infra-compose-core` (spec `docs/specs/infra-compose-core.md`) up to the developer hand-off.
- Completed: `compose.yaml` (postgres pgvector, minio, mailpit; pinned tags, named volumes, healthchecks, 127.0.0.1 overridable ports, env defaults), `.env.example`, `infra/postgres/initdb/01-extensions.sql`, `scripts/install-host-prereqs.sh` (mode 755; `--check`, `--help`, install mode), `init.sh` compose gate, `AGENTS.md` startup step, `docs/technical-discovery.md` optional data-root note, `docs/risks-and-open-questions.md` MinIO finding.
- Verification run: `bash -n` on both scripts (exit 0); helper `--help` (exit 0) and `--check` (8 items missing, exit 1, no sudo); `./init.sh` (Scenario 6 message, exit 0); `git check-ignore` (`.env` ignored, `.env.example` not); corrected pin check (all tagged, no `latest`); registry manifest checks for the image tags.
- Failed / not run: spec grep for unpinned images is faulty (matches pinned lines); replaced by an awk check documented in the spec. The planned MinIO tags (primary and fallback) return 401: `minio/minio` no longer exists on Docker Hub. No Docker runtime checks ran (Docker not installed). `.env` was not read or modified. No sudo was run.
- MinIO follow-up: developer chose `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`; `compose.yaml` updated, healthcheck switched to curl on `/minio/health/live` (curl present per image config, to confirm at runtime); MinIO item moved to Resolved.
- Runtime verification (after the developer installed Docker; agent used `newgrp docker`, no sudo): `--check` all 9 ok; `docker compose config -q` and `up -d --wait` exit 0, 3 services healthy; pgvector 0.8.1; ports 9001/8025/9000-live return 200; data survived `down`/`up`; `./init.sh` exit 0 (Scenario 5), exit 1 on unreachable daemon (Scenario 7), recovers a stopped minio (Scenario 8). MinIO curl healthcheck confirmed (`/usr/bin/curl` in image). Digests recorded in `feature_list.json`. Status `passing`. Stack left running.
- Independent validation: ACCEPT (2026-11-12). Validator re-ran scenarios 1-9 itself, confirmed 127.0.0.1-only bindings and digests; minor doc findings (data NVMe wording) fixed by the orchestrator. Status `accepted`.
- Next best step: `/feature-flow local-ai-gpu-spike`.
