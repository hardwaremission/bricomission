# Feature Implementation Spec: Core data services start with one compose command

## Source Feature

- `id`: infra-compose-core
- `area`: infrastructure
- `depends_on`: none
- `status`: not_started (at planning time, 2026-11-12)
- `source`: `feature_list.json`

## Goal

Give the repository its first runtime: a root `compose.yaml` that starts PostgreSQL with pgvector, MinIO and Mailpit with pinned tags, named volumes and healthchecks, so `docker compose up -d --wait` returns only when all three are healthy. `./init.sh` keeps its host prerequisite checks and adds the compose gate.

The host has no Docker yet, and agents cannot run `sudo` (no TTY). This feature therefore also ships `scripts/install-host-prereqs.sh`. The developer runs it in their own terminal to install Docker Engine, Compose v2 and buildx on CachyOS (pacman). The script also has a read-only `--check` mode that agents may run.

## Non-Goals

- Keycloak, llama-server, ComfyUI, Redis, API and web services (features `keycloak-realm-roles`, `local-ai-gpu-spike`, `gpu-job-broker`, `api-skeleton`, `web-pwa-shell`).
- Creating MinIO buckets, users or policies, and creating database schemas or migrations. Consumers create these later (API/Prisma).
- pnpm, Node workspace, any application code.
- Relocating Docker's data-root or volumes to a data NVMe. Document it as an optional note only. Do not script it and do not make it a requirement.
- Mounting or formatting the unmounted NVMe drives.
- Running `sudo` from any agent session.
- Parallel-worktree port allocation beyond making host ports overridable through env vars.

## Job Story

When I start a session on this repo,
I want one command to bring up the database, object storage and mail inbox and tell me they are healthy,
so I can build API features against real local services, offline, without manual setup.

## Users And Permissions

- Developer: runs `scripts/install-host-prereqs.sh` (it calls `sudo` internally), re-logs in, then runs `./init.sh` / `docker compose`.
- Agents (implementer, validator): may run `scripts/install-host-prereqs.sh --check`, `bash -n`, `./init.sh` and `docker compose ...` once the developer confirms Docker works. They must never run the install mode or `sudo`.
- No product roles are involved.

## Acceptance Scenarios

### Scenario 1: Stack comes up healthy

Given Docker Engine + Compose v2 are installed, the daemon is running and the user can reach it without sudo
When the developer runs `docker compose up -d --wait` at the repo root
Then the command exits 0 and `docker compose ps` shows `postgres`, `minio` and `mailpit` as `running (healthy)`.

### Scenario 2: pgvector is available

Given the stack is healthy
When `docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'CREATE EXTENSION IF NOT EXISTS vector;'` runs (values from `.env.example` defaults)
Then it succeeds, and `SELECT extversion FROM pg_extension WHERE extname='vector'` returns a version.

### Scenario 3: Web UIs answer on published ports

Given the stack is healthy
When `curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:9001/` (MinIO console) and `http://127.0.0.1:8025/` (Mailpit UI) run
Then both return 200. `curl -fsS http://127.0.0.1:9000/minio/health/live` also returns 200.

### Scenario 4: Data survives restart

Given a table was created in Postgres
When `docker compose down` (without `-v`) and then `docker compose up -d --wait` run
Then the table still exists, because the data lives in named volumes.

### Scenario 5: init.sh gate passes

Given the stack can start
When `./init.sh` runs
Then it prints the prerequisite list, runs `docker compose up -d --wait`, prints each service's health and exits 0. It must not start foreground or long-running processes.

### Scenario 6: init.sh without Docker

Given the `docker` CLI is not installed
When `./init.sh` runs
Then it prints the prerequisite list and a clear message: "Docker not installed: run ./scripts/install-host-prereqs.sh in your own terminal (needs sudo), then log out/in". It skips the compose gate and exits 0. This keeps the harness usable pre-install.

### Scenario 7: init.sh with Docker present but daemon unreachable

Given `docker` exists but `docker info` fails (service stopped, or the docker group is not active in this session)
When `./init.sh` runs
Then it prints the likely causes and fixes (`systemctl status docker`, re-login or `newgrp docker`) and exits 1.

### Scenario 8: init.sh with an unhealthy service

Given Docker works but a service fails its healthcheck or `up --wait` times out
When `./init.sh` runs
Then it prints `docker compose ps` and exits non-zero.

### Scenario 9: Helper check mode is read-only

Given any host state
When `./scripts/install-host-prereqs.sh --check` runs as a normal user
Then it reports each item as `[ok]` or `[missing]`, never calls `sudo` and never changes the system. It exits 0 only if every item is ok. The items are: pacman, docker, docker compose v2, docker buildx, docker.service enabled, docker.service active, user in the docker group, group active in the current session, daemon reachable.

### Scenario 10: Helper install is idempotent

Given CachyOS/Arch with pacman
When the developer runs `./scripts/install-host-prereqs.sh` once, and then runs it again
Then the first run installs `docker docker-compose docker-buildx` (`pacman -S --needed`), runs `systemctl enable --now docker.service` and adds the invoking user to `docker`. It then prints the re-login note and the result of `--check`. The second run changes nothing and reports all items as already done.

### Scenario 11: Helper on a non-pacman host

Given `pacman` is not on PATH
When the install mode runs
Then it exits 1 with "unsupported: this helper only supports pacman-based hosts (Arch/CachyOS)" and changes nothing.

## Repository Research

### Files Inspected

- `AGENTS.md`: rules (Compose v2, pinned tags, named volumes, healthchecks, bash only, subagents never commit).
- `PROGRESS.md`: current blocker is Docker not installed; `infra-compose-core` is next.
- `feature_list.json`: feature scope and verification list.
- `init.sh`: pre-bootstrap variant. It has a `check()` helper, prerequisite list, GPU check and feature_list JSON check, and always exits 0.
- `.gitignore`: `.env` and `.env.*` are ignored, and `!.env.example` is re-included.
- `docs/technical-discovery.md`: Compose service list, offline after first pull, `COMPOSE_PROJECT_NAME` per worktree, volumes on the data NVMe (now optional per the developer decision).
- `docs/risks-and-open-questions.md`: the MinIO image/licensing question is open.
- `Documentación del Proyecto_BricoMission.md` (grep only): MinIO is mandated as S3 storage; Mailpit is the offline OTP inbox; pgvector is used for RAG.
- `.env` exists at the repo root. Its content was NOT inspected and may hold developer secrets. It is git-ignored.

### Existing Patterns To Follow

- `init.sh` style: `set -euo pipefail`, `cd "$(dirname "$0")"`, `[ok]`/`[missing]` lines via `check()`.
- English identifiers and comments; bash only.

### Current Gaps

- No Docker on the host, so runtime verification depends on the developer running the helper.
- No `scripts/`, `compose.yaml`, `.env.example` or `infra/` yet.
- No shellcheck or YAML linter confirmed on the host. Static checks are limited to `bash -n` and, after the install, `docker compose config -q`.

## Technical Approach

**Images (pinned, no `latest`).** Before the first commit, the implementer confirms that each tag exists. Use `docker manifest inspect <image>` or the first pull once Docker is installed. If a candidate tag is missing, use the nearest existing patch of the same line and record the final tag in evidence.

- `postgres`: `pgvector/pgvector:0.8.1-pg17` (fallback `0.8.0-pg17`). Stay on PG 17: PG 18 images change the `PGDATA` layout.
- `minio`: `minio/minio:RELEASE.2025-09-07T16-13-09Z` (fallback `RELEASE.2025-04-22T22-12-26Z`).
- `mailpit`: `axllent/mailpit:v1.27` (or the newest exact `v1.x.y` tag that exists; prefer an exact patch tag).

**MinIO licensing decision.** Use the upstream community image `minio/minio` (AGPLv3). We run it unmodified as a local, separate service and talk to it only over the S3 protocol, so the AGPL obligations do not extend to our code. Upstream stopped publishing community binaries and images in late 2025, and recent releases removed admin features from the console. We therefore pin the last available community image and accept that it gets no further updates for this offline local MVP. Admin features are not needed: the console is used only as an object browser. Swapping to any S3-compatible server later is an image change only. Record this in `docs/risks-and-open-questions.md` and move the item to resolved.

**compose.yaml** (root, no top-level `version:` key, no `name:` so `COMPOSE_PROJECT_NAME` works per worktree):

- Every variable is interpolated with a default (`${POSTGRES_USER:-bricomission}` and similar), so the stack works with no `.env` at all. Defaults must equal the values in `.env.example`.
- Host ports are bound to `127.0.0.1` and overridable: `POSTGRES_PORT` 5432, `MINIO_API_PORT` 9000, `MINIO_CONSOLE_PORT` 9001, `MAILPIT_UI_PORT` 8025, `MAILPIT_SMTP_PORT` 1025.
- `postgres`: env `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (all default `bricomission`). Volume `postgres-data:/var/lib/postgresql/data`. Mount `./infra/postgres/initdb:/docker-entrypoint-initdb.d:ro` containing `01-extensions.sql` (`CREATE EXTENSION IF NOT EXISTS vector;`). Healthcheck `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}`: interval 5s, timeout 5s, retries 20, start_period 10s.
- `minio`: `command: server /data --console-address ":9001"`. Env `MINIO_ROOT_USER` (default `bricomission`), `MINIO_ROOT_PASSWORD` (default `bricomission-dev-secret`, at least 8 chars). Volume `minio-data:/data`. Healthcheck `["CMD", "mc", "ready", "local"]` (`mc` ships in the image; do not rely on `curl` inside it). Same timings.
- `mailpit`: env `MP_MAX_MESSAGES=5000`. Volume `mailpit-data:/data` with `MP_DATABASE=/data/mailpit.db`. Healthcheck `["CMD", "/mailpit", "readyz"]`.
- `restart: unless-stopped` on all three. No GPU devices, no custom networks (default network is enough).

**.env.example.** List every variable above with its default and a one-line comment. Add a header: "copy to .env to override; .env is git-ignored; never commit real secrets". Do not touch the existing `.env`. Agents must not read, print or modify `.env`. Compose reads `.env` automatically; unknown keys in it are harmless.

**infra/postgres/initdb/01-extensions.sql.** Contains only the extension creation. It runs only on first volume init. The verification still runs `CREATE EXTENSION IF NOT EXISTS` explicitly.

**init.sh** (rename the status to `infra`; keep the existing structure):

1. Keep the prerequisite checks, GPU check and feature_list JSON check unchanged. Missing pnpm still only reports (needed from `api-skeleton`).
2. Compose gate. If `docker` is absent, print the Scenario 6 message and skip the gate (exit 0 at the end). If `docker compose version` fails, print "Compose v2 plugin missing: run the helper" and exit 1. If `docker info` fails, print the Scenario 7 message and exit 1. Otherwise run `docker compose config -q`, then `docker compose up -d --wait --wait-timeout 180`. On failure, print `docker compose ps` and exit 1. On success, print `docker compose ps --format 'table {{.Service}}\t{{.Status}}'`.
3. Final lines: replace the "Application stack is not initialized" text with stack status and the next commands (`docker compose logs -f <service>`, `docker compose down`). Keep the pnpm hints as "after api-skeleton".
4. Update the header comment: init.sh starts the detached infra stack and verifies health, and never runs foreground servers.

**scripts/install-host-prereqs.sh** (bash, `set -euo pipefail`, executable):

- Usage: `install-host-prereqs.sh [--check | --help]`.
- `--check` prints the Scenario 9 items using the same `[ok]`/`[missing]` format. It needs no root and runs no `sudo`: only `command -v`, `systemctl is-enabled/is-active`, `getent group docker`, `id -nG` and `docker info`. Exit 0 if all are ok, otherwise 1.
- Install mode (default):
  - Refuse if not pacman (Scenario 11).
  - Target user is `${SUDO_USER:-$USER}`. If `id -u` is 0 and `SUDO_USER` is empty, refuse with a message to run as the normal user.
  - Print the planned actions. Then run `sudo pacman -S --needed docker docker-compose docker-buildx` with pacman's own confirmation kept, and `sudo systemctl enable --now docker.service`.
  - Run `sudo usermod -aG docker "$user"` only if the user is not yet in the group.
  - Then print the notes: (a) log out/in, or run `newgrp docker`, for the group to take effect; (b) docker group membership is root-equivalent; (c) on a stale package DB, run `sudo pacman -Syu` first (no partial upgrades).
  - Finally run the `--check` logic. A missing session group or unreachable daemon right after install is expected; label it "pending re-login".
- Optional data-root relocation: comment and doc note only (see Durable Documentation Impact). No code.

## Expected File Changes

- `compose.yaml`: create; three services, three named volumes.
- `.env.example`: create; all compose variables with defaults.
- `infra/postgres/initdb/01-extensions.sql`: create; pgvector extension.
- `scripts/install-host-prereqs.sh`: create (mode 755); host prerequisite installer and checker.
- `init.sh`: modify; compose gate per the Technical Approach.
- `docs/risks-and-open-questions.md`: modify; resolve the MinIO question with the decision above.
- `docs/technical-discovery.md`: modify; replace "Model weights and Docker volumes on a data NVMe" with an optional note: mount the drive, set `"data-root"` in `/etc/docker/daemon.json` before the first pull, restart docker; manual, developer-run, needs sudo.
- `AGENTS.md`: modify Startup Workflow: if `./init.sh` reports Docker missing, ask the developer to run `scripts/install-host-prereqs.sh`; agents run only `--check`.
- `PROGRESS.md`, `feature_list.json`: update state and evidence (implementer sets `passing`, never `accepted`).

## Visual Design Impact

- UI involved: no. The MinIO console and Mailpit UI are third-party tools. No design artifact required.

## Durable Documentation Impact

- `ARCHITECTURE.md`: not needed. The infra services are self-described in `compose.yaml`; `api-skeleton` establishes the app layers and creates the file.
- `CONSTRAINTS.md`: not needed. The Compose, pinning and bash rules already live in `AGENTS.md`/`CLAUDE.md`.
- `AGENTS.md`: update (startup path now includes the helper script and the compose gate).
- Other docs: `docs/risks-and-open-questions.md` and `docs/technical-discovery.md` as listed above.

## Implementation Plan

1. Write `scripts/install-host-prereqs.sh` and verify `--check` and `--help` statically (`bash -n`) and by running `--check`. It must run without sudo and is expected to report missing items now.
2. Write `compose.yaml`, `.env.example` and `infra/postgres/initdb/01-extensions.sql`.
3. Extend `init.sh`. Run it: in the pre-install state it must hit Scenario 6 and exit 0.
4. Update the docs listed above.
5. STOP and hand back to the orchestrator: "developer must run `./scripts/install-host-prereqs.sh` in their terminal and re-login". Do not mark `passing` before the runtime checks.
6. After the developer confirms, run the runtime verification, confirm or adjust the image tags, record evidence, and mark `passing`.

## Implementation Tasks

- [ ] Create `scripts/install-host-prereqs.sh` (check, install and help modes; idempotent; pacman guard; root guard).
- [ ] `chmod +x scripts/install-host-prereqs.sh`; `bash -n` both scripts.
- [ ] Create `compose.yaml` with three services, healthchecks, named volumes, localhost-bound overridable ports and env defaults.
- [ ] Create `.env.example` matching the compose defaults.
- [ ] Create `infra/postgres/initdb/01-extensions.sql`.
- [ ] Extend `init.sh` (Scenarios 5-8).
- [ ] Update `docs/risks-and-open-questions.md`, `docs/technical-discovery.md` and `AGENTS.md`.
- [ ] (After the developer installs Docker) Run the runtime verification and pin the final tags.
- [ ] Update `PROGRESS.md` and the `feature_list.json` evidence.

## Verification Plan

The agent can run these now, with no sudo and no Docker:

- `bash -n init.sh scripts/install-host-prereqs.sh` exits 0.
- `./scripts/install-host-prereqs.sh --check` lists items, exits 1 and makes no system change.
- `./scripts/install-host-prereqs.sh --help` prints usage.
- `./init.sh` hits Scenario 6 and exits 0.
- `git check-ignore .env` matches; `git check-ignore .env.example` does not.
- `grep -nE 'image:.*(:latest|[^:]+$)' compose.yaml` finds nothing (every image has an explicit non-latest tag).

**Developer-only step (needs sudo, own terminal).** The orchestrator hands this over and waits for confirmation:

- `./scripts/install-host-prereqs.sh`, then log out/in (or `newgrp docker`).
- Optional, before the first pull, and not required: relocate the Docker data-root to a mounted data NVMe as described in `docs/technical-discovery.md`.
- The developer confirms that `./scripts/install-host-prereqs.sh --check` exits 0.

The agent runs these after confirmation (no sudo):

- `docker compose config -q` exits 0.
- `docker compose up -d --wait` exits 0; `docker compose ps` shows 3 services healthy (Scenario 1).
- Scenario 2 psql commands succeed.
- Scenario 3 curl commands return 200.
- Scenario 4 persistence check: create table `smoke_check`, run `down` and `up --wait`, confirm the table is still there, then drop it.
- `./init.sh` exits 0 and prints the healthy table (Scenario 5).
- Scenario 8: `docker compose stop minio`, then `./init.sh` restarts it via `up --wait` and passes. A forced-unhealthy test is optional.
- Run the second (idempotent) helper install only if the developer agrees, because it calls sudo. Otherwise `--check` evidence is enough.
- E2E: not applicable. There is no app, route or API flow yet, and no persistent E2E harness exists.

## Evidence To Capture

- The final pinned image tags (and digests from `docker compose images` if practical).
- Output of `--check` before and after the install.
- `docker compose up -d --wait` exit code and `docker compose ps` table.
- psql `extversion` output; curl status codes for 9000, 9001 and 8025.
- `./init.sh` tail output and exit code, in both the pre-install and the post-install state.
- Record the evidence in the `feature_list.json` `evidence` array and as a PROGRESS.md session entry.

## Validator Checklist

- [ ] Only the listed files changed; no Keycloak, AI, API or web services; no bucket or schema creation.
- [ ] Every image is pinned (no `latest`, no untagged image); named volumes and healthchecks exist on all three services.
- [ ] Ports are bound to 127.0.0.1 and overridable; the compose defaults equal `.env.example`; `.env` is untouched and uncommitted.
- [ ] The helper `--check` never invokes sudo (inspect the code path). Install mode is idempotent, pacman-guarded and root-guarded, and prints the re-login note.
- [ ] No agent ran sudo; the developer confirmation of the install is recorded.
- [ ] `init.sh` keeps the prerequisite checks. It exits 0 without Docker (with the message), exits 1 on an unreachable daemon or unhealthy stack, and starts no foreground processes.
- [ ] Runtime verification evidence is present for Scenarios 1-5.
- [ ] The MinIO licensing decision is recorded in `docs/risks-and-open-questions.md`; the data-root note is optional, not required.
- [ ] `feature_list.json` status is `passing` (not `accepted`) with evidence; PROGRESS.md is updated.

## Implementation Findings (implementer, 2026-11-12)

- **MinIO image not pullable (blocker for runtime verification).** Registry checks (anonymous token + manifest HEAD) on 2026-11-12: `registry-1.docker.io/minio/minio` returns 401 for both planned tags and for `latest`; the Docker Hub `minio` namespace no longer lists a `minio` (or `mc`) repository; `quay.io/minio/minio` returns 401 while `quay.io/keycloak/keycloak:latest` returns 200 with the same method. Neither the primary tag nor the fallback in the Technical Approach exists anymore. `compose.yaml` keeps the planned tag with a BLOCKED comment until a decision is made. Pullable candidates on Docker Hub: `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` (Pigsty community fork, AGPLv3, latest release 2026-08-04) and `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` (third-party rebuild). Either must be re-checked for the `mc ready local` healthcheck once Docker is installed. The MinIO licensing item therefore stays open in `docs/risks-and-open-questions.md` instead of moving to resolved.
- **Mailpit tag.** `axllent/mailpit:v1.27` exists but is a minor tag; the newest exact patch tag `v1.33.1` exists (manifest 200) and is used, as the Technical Approach prefers.
- **pgvector tag.** `pgvector/pgvector:0.8.1-pg17` exists (manifest 200).
- **Verification Plan grep is wrong.** `grep -nE 'image:.*(:latest|[^:]+$)' compose.yaml` matches every pinned image line too (`.*` swallows `repo:` and `[^:]+$` then matches the tag), so it can never return "nothing". Replacement check used instead (fails on untagged or `:latest` images):
  `awk '/^[[:space:]]*image:/{n=split($2,a,"/"); if (a[n] !~ /:/ || a[n] ~ /:latest$/) {print "UNPINNED: " $2; bad=1}} END{exit bad}' compose.yaml`
- **MinIO decision (developer, 2026-11-12).** Use `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` (manifest 200, OCI index with amd64). Its image config (read from the registry, no pull) shows a UBI9-micro base with `/usr/bin/minio`, `/usr/bin/mcli`, an `mc` symlink and `COPY /go/bin/curl* /usr/bin/`; entrypoint `/usr/bin/docker-entrypoint.sh`, cmd `minio`. The healthcheck therefore uses `curl -fsS http://127.0.0.1:9000/minio/health/live` instead of `mc ready local`. Runtime check confirmed `/usr/bin/curl` in the image and a passing probe, so the `mc ready local` fallback is not needed. The MinIO licensing item moved to Resolved in `docs/risks-and-open-questions.md`.
