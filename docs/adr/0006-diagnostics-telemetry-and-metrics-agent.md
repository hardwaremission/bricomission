# ADR 0006: Own diagnostics event bus, a privileged read-only metrics agent and a no-login localhost dashboard

## Status
Accepted, 2026-11-15 (feature `diagnostics-dashboard`; spikes in `docs/spikes/diagnostics-metrics-spike.md`).

## Context

The MVP closes with a dashboard that explains the architecture by itself during the demo: every container and every API module is a node, every communication lights an edge and writes a log line with what was sent (the budget prompt, the style prompt built from several images), and every container shows CPU, RAM, VRAM and GPU %. The demo runs offline on one machine (Ryzen 9 5950X, Radeon RX 9070 XT 16 GB, kernel 7.3.3, ROCm inside containers, no host ROCm). The dashboard is a presenter tool, built in the last week before the deadline. It must never change app state, never call an AI endpoint and never cost anything when it is off.

## Decision

**1. Own event bus, not OpenTelemetry.** The API holds a small in-process bus (`apps/api/src/diagnostics/`): events `{id, ts, correlationId, from, to, kind, summary, payload, span?}` in a memory ring buffer (1000 events and 32 MB by default, oldest evicted), served as Server-Sent Events with replay on connect and `Last-Event-ID` resume. `from` and `to` are node ids of one topology file (`topology.ts`, 23 nodes and 24 edges), which is also served to the dashboard, so the graph cannot name a node the API does not know. A correlation id (16 hex characters, header `X-Correlation-Id`) is minted by the web BFF, kept in an `AsyncLocalStorage` in the API, captured by the GPU job broker at `submit` and re-entered when the job starts. Instrumentation is installed at composition time (decorators around the LLM, image, storage, embedder and JWKS providers, the Prisma query log, one guarded line per narrated step). The web BFF posts metadata-only events to `POST /diagnostics/ingest`; the API validates and redacts them again.

**2. Off by default, and off means absent.** Without `DIAGNOSTICS_ENABLED=true` and a `DIAGNOSTICS_TOKEN` of at least 16 characters, no decorator is installed, no middleware is mounted, every `/diagnostics/*` route is a plain 404 and a no-op `NullDiagnostics` is injected. The routes are hidden from OpenAPI, so the contract and the generated client do not change.

**3. Shared token on the server side only.** The API routes and the agent accept only the header `X-Diagnostics-Token` (never a query string, never a Keycloak JWT), compared as SHA-256 digests with `timingSafeEqual`. The token lives in the API, the web BFF, the agent and the dashboard **server**. The browser reads one same-origin stream (`/stream`) from the dashboard server and never sees the token (asserted by the E2E).

**4. Redaction before the buffer.** One pure helper (`redact.ts`, fuzz-tested) runs on every event before it is stored: tokens, cookies, secrets, passwords, OTP codes, seeds, JWT shapes, Bearer values and `data:` URIs are removed, emails are masked, binary values become sizes. Prompts and the calculated style text pass verbatim: showing them is the purpose. Images appear only as thumbnails built by the API (at most 96 px and 6 KB, at most 8 per event) or as sizes.

**5. A privileged, read-only metrics agent in its own container.** `apps/diagnostics-agent` (plain Node, standard library only) samples once per second and serves the samples on the compose network only (port 3300, not published, token required). Its privileges, each one required and tested in spike A1:

| Privilege | Why | What it exposes |
|-----------|-----|-----------------|
| `pid: host` | map every container's PIDs and read their `/proc/<pid>/fdinfo` | the command line and fd table of every host process |
| `cgroup: host` | host-absolute cgroup v2 paths (`docker-<id>.scope`) | host cgroup state |
| `user: root` + `cap_add: SYS_PTRACE` (all other capabilities dropped) | read the fds of llama-server and ComfyUI (VRAM per container); the Docker socket is `root:docker 660` | read access to other processes' fd metadata |
| `/sys` mounted read-only | cgroup counters, amdgpu card files, KFD sysfs | host hardware state |
| Docker socket mounted `:ro` | compose service name and health of each container | **the whole Docker API**: `:ro` protects the socket file, not the API |

Mitigations: the profile is off by default; no published port; `read_only` root filesystem, `cap_drop: ALL`, `no-new-privileges`, no volume of its own; the code can only send `GET /containers/json`, `GET /containers/json?all=1` and `GET /containers/<id>/json` (hard-coded method and path allowlist, unit-tested); every data route needs the token. A compromised agent could still drive Docker through the socket. That is accepted for the presenter's machine and for nothing else.

**6. Metric sources and their honesty.** CPU and RAM come from cgroup v2 and match `docker stats`. VRAM per container is measured (`drm-memory-vram` in amdgpu fdinfo, summed over distinct `drm-client-id` of every PID of the container, KFD sysfs as the fallback). **GPU % per container is approximate**: on this kernel and card the per-process engine counters do not move for ROCm workloads (`drm-engine-compute` does not exist, `drm-engine-gfx` stays flat), so the agent attributes the card-wide `gpu_busy_percent` by KFD compute-unit occupancy share (with a 10 s hold and a VRAM-share fallback) and always marks it `approx: true`. The value never exceeds the card value. Anything that cannot be measured is `null` and drawn as `n/a` (for example VRAM of containers whose processes run as another uid), never 0 and never a guess. API modules share one process, so their widgets show the API container's values labelled `shared` plus their own real counters.

**7. No login, 127.0.0.1 only.** The dashboard (`apps/diagnostics`, Next.js, compose service `diagnostics`, profile `diagnostics`) is published on `127.0.0.1:${DIAGNOSTICS_PORT:-3200}` and has no authentication. It shows every user's prompts and project metadata, so it is only for the machine that runs the demo. It has no write path to the app: it reads two streams and one topology document.

**8. Graph drawn from the design's own geometry, not from a layout engine.** Nodes sit at the rectangles exported from the approved OpenPencil design and every edge is drawn on the design's orthogonal reference polyline (`layout-reference.json`, a byte copy of the export, guarded by a drift test). `@xyflow/react` (MIT, exact version, bundled) provides the canvas, zoom and fit; ELK is not used.

## Alternatives Considered

- **OpenTelemetry + Jaeger (or Tempo) + Prometheus/cAdvisor**: the standard answer, but four more containers, an SDK in two apps, and a trace UI made for engineers. It shows spans, not "this node sent this prompt to that node", has no per-container VRAM for amdgpu, and would still need the custom graph. Too much for the last week and worse for the audience. The event model keeps a correlation id and span pairs, so an exporter can be added later.
- **Persisting events (PostgreSQL)**: history is not needed for a live demo, and prompts in a table would be a second copy of user data to protect. A recorded NDJSON session (`?source=replay`) covers rehearsal.
- **Token in the browser (query string or header through a fetch-based stream)**: simpler (no dashboard server proxy), but the token would sit in the page, in history and in logs.
- **Docker socket proxy (`tecnativa/docker-socket-proxy` with `CONTAINERS=1`)**: removes the "whole Docker API" exposure at the cost of one more pinned image and container. Not done in the MVP; it is the first hardening step if the dashboard ever leaves the demo machine. A second option reads only cgroups and `/proc` without the socket, and loses service names and health.
- **`docker stats` or cAdvisor for metrics**: no VRAM, no GPU %. **`radeontop`/`nvtop` inside the AI containers**: changes the AI images and still gives card-wide numbers.
- **Exact per-container GPU %**: not available from this kernel for ROCm processes (spike A1). Showing the card-wide value on both AI nodes would be simpler but wrong whenever both are resident.
- **ELK (`elkjs`) for edge routing**: tried with the layered algorithm, orthogonal routing and fixed ports seeded with the design rectangles. It moved all 23 nodes (up to 736 px) and matched 0 of 24 routes; its `fixed` algorithm keeps positions but does not route. The design already contains a hand-checked routing, so it is used as data.
- **Login with Keycloak for the dashboard**: correct for a product feature, but the dashboard must work while the app is signed out and during the sign-in it narrates. Localhost binding is the control instead.

## Consequences

- With diagnostics off the app is unchanged: no wrapper, no route, same OpenAPI document. With it on, every request allocates events and thumbnails; the cost was not benchmarked beyond the demo flows, so it must stay off outside the demo.
- Prompts of every user are visible to anyone who can open `127.0.0.1:3200` on the demo machine, and stay in API memory until evicted. Never enable it on a shared or reachable host.
- The agent is the most privileged container of the stack. It must stay in its opt-in profile, with no published port, and must keep its GET-only allowlist. Adding a write call or a port needs a new decision.
- GPU % on the AI nodes is an attribution and is labelled `~ approx` in the widget and the legend; VRAM is the reliable per-container GPU number. Non-AMD GPUs show `n/a`.
- Node positions and routes are data from the design. A new node or edge needs the design updated and exported again; the topology test and the layout tests fail until the API topology, the layout and the reference file agree.
- Changing `DIAGNOSTICS_TOKEN` or `DIAGNOSTICS_ENABLED` needs the `api`, `web`, `diagnostics` and `diagnostics-agent` containers recreated from the same environment. Scripts that recreate the `api` (`scripts/catalog/ingest.sh`, the smoke scripts) turn diagnostics off again unless `DIAGNOSTICS_ENABLED=true` is exported; `launch-demo.sh` exports it once for every compose call.
- The dashboard is English only and desktop only (1920x1080, checked at 1440x1080 and 1366x768).
