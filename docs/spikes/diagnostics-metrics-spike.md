# Diagnostics dashboard: phase A spikes (A1 metrics, A2 SSE and context, A3 graph library)

Feature `diagnostics-dashboard` (spec `docs/specs/diagnostics-dashboard.md`), spikes run 2026-11-15 on the dev host
(Radeon RX 9070 XT 16 GB, RDNA4, kernel 7.3.3-1-cachyos, Docker 29.9.3 Compose 5.7.1, cgroup v2 with the systemd driver).
Verdicts: **A1 partly true** (VRAM, CPU and RAM per container are real; per-container GPU % is NOT available from
`drm-engine-*`, see the corrected formula), **A2 pass**, **A3 pass (go with `@xyflow/react`)**. No spike blocks the feature.
Throwaway code (removed in phase F, 2026-11-15, once superseded by `apps/diagnostics-agent`, `apps/api/test/diagnostics/correlation.spec.ts` and `apps/diagnostics`; the paths below are kept as the record of what was run): `scripts/ai-spike/diag-probe/` (A1) and `scripts/ai-spike/diag-spike/` (A2, A3); recorded
samples: `docs/spikes/assets/diagnostics-fixtures/`.

## A1. amdgpu and cgroup mapping per container

### Method
- Real stack as `launch-demo.sh` local mode (core + CPU embedder with the sample Catalog + `llama-server` router mode +
  `comfyui`, API `AI_ADAPTERS=local`), driven by `scripts/ai/simulation-smoke.sh` (3 blend-mode Simulations, a
  "generate again", a Budget; holds `/tmp/bricomission-gpu.lock`; peak VRAM 16.2 GB, Simulations 31-64 s, Budget 247 s).
- Reader (throwaway, stdlib Node, `scripts/ai-spike/diag-probe/probe.mjs`) in a container of the API image started with
  `--pid host --cgroupns host -v /sys:/sys:ro -v /var/run/docker.sock:/var/run/docker.sock:ro --read-only
  --security-opt no-new-privileges:true --cap-drop ALL`. `probe.mjs sample 480 <dir>` wrote one record per second (all
  PIDs with a `/dev/dri/renderD*` or `/dev/kfd` fd, their fdinfo drm lines, kfd sysfs, cgroup files, `gpu_busy_percent`).
  Two extra runs sampled `/sys/class/kfd/kfd/proc/<pid>/*` at 4 Hz (`kfd-walk.sh`) during one ComfyUI render and one chat
  completion. `docker stats` was sampled in parallel every 8 s for comparison.

### Cgroup layout (v2, verified)
- Every compose container is `/system.slice/docker-<64 hex>.scope`. `/proc/<pid>/cgroup` of any process in it reads
  `0::/system.slice/docker-<id>.scope` (fixtures `proc-cgroup-*.txt`). With `cgroup: host` (`--cgroupns host`) the path is
  host-absolute, and the files are readable through the `/sys:ro` mount at `/sys/fs/cgroup/system.slice/docker-<id>.scope/`:
  `cpu.stat` (`usage_usec`), `memory.current`, `memory.stat` (`inactive_file`), `cgroup.procs`.
- Host PIDs: the host namespace PIDs are what `pid: host` shows, and `State.Pid` of Docker equals the cgroup member PID.
  Whole-`/proc` scan: 662-668 PIDs, **p50 40 ms, p95 68 ms, max 87 ms** (includes readlink of every fd and fdinfo of the 20
  DRM fds). Steady tick (PIDs already known: fdinfo + kfd + 9 cgroups + card sysfs): **1.0 ms**, one `cu_occupancy` read
  0.033 ms. Design: rediscover PIDs every 5 s (at the Docker poll), read only known PIDs every tick.
- Compose services observed (container id prefix, service): api c66b690523d1 (recreated during the run), web aabe7a452858,
  llama-server 8929cb1d5d51, comfyui c7525eb43099, embedder 5493e965dd46, keycloak 40e273f59cbc, postgres 515258e01afd,
  minio 0b361d379e46, mailpit c6db47ed54c5. **A container recreated by `docker compose up` (the smoke script recreates
  `api`) gets a new id and a new scope, and for a moment both exist.**
- **Label pitfall (new, changes the spec):** `GET /containers/json` returned the throwaway probe container with
  `com.docker.compose.project` and `com.docker.compose.service=api`, because those three labels (`project`, `service`,
  `version`) are inherited from the compose-built **image**. Real compose containers also carry `container-number`,
  `oneoff`, `config-hash`, `project.working_dir`. One-off containers (`api-run-*` from `ingest.sh`) have `oneoff=True`.
  The mapping must accept a container only when `State=running`, label `com.docker.compose.container-number` exists,
  `oneoff` is `False` and `com.docker.compose.project` equals the agent's own project (read from its own container's label
  at start, so parallel worktrees do not mix), and pick the newest `Created` when two share a service.
  Fixture: `containers-json.json` (contains the inherited-label impostor on purpose).

### Which fdinfo counters exist and move
`/proc/<pid>/fdinfo/<fd>` of the `/dev/dri/renderD128` fd (raw fixtures `fdinfo-*.txt`) has: `drm-driver: amdgpu`,
`drm-client-id`, `drm-pdev`, `drm-total|shared|resident|purgeable-{cpu,gtt,vram,gds,gws,oa,doorbell,mmioremap}` and
`drm-memory-vram|gtt|cpu` (KiB). The `/dev/kfd` fd has only `pos` and `flags`.
- **`drm-engine-compute` does not exist on this kernel and `drm-engine-gfx` never appears for llama-server or ComfyUI.**
  In 480 s of samples (19 MB) `drm-engine-*` occurs only as `drm-engine-gfx` for desktop graphics clients (kwin, plasmashell,
  firefox: 12000 lines) and never for a ROCm process. Reason (amdgpu_fdinfo.c): engine lines are printed only when the DRM
  scheduler accounted run time; ROCm compute goes through user-mode KFD queues that bypass the scheduler. So the spec
  formula `delta (gfx + compute) engine ns / wall ns` reads nothing for the two AI nodes. It is replaced below.
- `drm-memory-vram` is real and moves: comfyui 13.7 GB at start, 16.1 GB peak, 8.4 GB after the LLM took the card; the
  `llama-server` **child** (router mode spawns one `llama-server` per model inside the same cgroup) 143 MB while loading,
  4.58 GB resident; the router process itself holds a DRM client with 56 KiB VRAM. **A container's VRAM is the sum over
  all PIDs of the cgroup (and distinct `drm-client-id` per PID), not the main PID.** Each AI PID had exactly one
  render-node fd and one client id here; the dedupe by `drm-client-id` is still required (the host's kwin has 4 fds with
  one client id).
- Cross-checks (30 samples, containers only): sum of `drm-memory-vram` 12672 MiB vs kfd per-PID `vram_<gpu_id>` 12769 MiB
  (kfd 0.8 % higher, it also counts queue and doorbell objects); at peak comfyui 15752 MiB (fdinfo) vs 15733 MiB (kfd).
  `mem_info_vram_used` 14.5 GB at the same moment: the rest is the desktop (about 1.8 GB; 2135 MiB with every container
  stopped). So fdinfo VRAM is per-container exact; kfd is a validated fallback.

### Capabilities needed to read other containers' fdinfo (tested, `--cap-drop ALL` base)
| Variant | Result |
|---|---|
| root, no caps | `EACCES` on `/proc/<pid>/fd` of every container PID incl. root-owned llama-server and ComfyUI (the kernel requires the reader's caps to cover the target's caps, or `CAP_SYS_PTRACE`) |
| root + `SYS_PTRACE` | **reads llama-server and ComfyUI (the only GPU processes); fails only for other-uid processes (web `juanmi`, postgres 999, keycloak): 103 of 663 PIDs `EACCES`, none holds a GPU fd** |
| root + `SYS_PTRACE` + `DAC_READ_SEARCH` | reads every PID (0 denied) |
| root + `DAC_READ_SEARCH` only | no DRM fd visible (readlink denied) |
| uid 1000 + `SYS_PTRACE` | cannot open the Docker socket (`root:docker 660`) nor other users' fds |
| root, default Docker caps | reads everything (default caps cover the targets) |
Decision: `user: root`, `cap_drop: [ALL]`, `cap_add: [SYS_PTRACE]` (add `DAC_READ_SEARCH` only if a non-root GPU container is ever added),
`read_only: true`, `no-new-privileges`, `/sys:ro`, socket `:ro` (GET `/containers/json` worked, 8.9 KB). kfd sysfs, `gpu_busy_percent`,
`mem_info_vram_*` and the cgroup files need no capability. The output directory of a `--cap-drop ALL` root cannot be a host
dir owned by another user (no `DAC_OVERRIDE`): the agent writes nothing, it only serves.

### GPU %: corrected formula
- Global `gpu_busy_percent` works: 98-100 during an SDXL render, 37-39 during LLM decoding with experts on the CPU,
  3-4 at idle with the desktop.
- Per-process signal available under KFD: `/sys/class/kfd/kfd/proc/<pid>/stats_<gpu_id>/cu_occupancy` (instantaneous number
  of compute units the process' queues occupy, 0-64 on this card). It is a spiky snapshot, not a duty cycle: during a 25-step
  render sampled at 4 Hz it was above 0 in 56 of 415 samples (max 64, mean 24.6 when above 0) while the card was 99 % busy; the
  llama child showed max 56 in 31 of 181 samples while decoding; the idle router and the idle other AI container read 0 in
  both runs. Also `evicted_ms` (cumulative, moves with GPU memory pressure) and `counters_*/{faults,page_in,page_out}`.
  Fixtures `kfd-walk-*.tsv`.
- **Decision (replaces spec Decision 7 GPU %):** `gpuPct[c] = gpu_busy_percent x share[c]`, where `share[c]` = the container's
  `cu_occupancy` summed over the last 2 s (sampled 4 times per second, kfd files of its PIDs) divided by the sum over all
  containers; if the sum is 0 and `gpu_busy_percent` is at least 10, split by VRAM share; always `approx: true` (the legend
  explains: "global GPU busy % attributed by compute-unit occupancy"). Because the GPU broker serialises the LLM and image jobs,
  the attribution is unambiguous in practice (in both runs the other AI container read 0). `vramMiB` stays exact (fdinfo, kfd
  fallback). Without kfd the card total goes to the container with the largest VRAM change, still `approx`. Cut-order item 7
  therefore becomes the default, not a fallback; the Scenario 6 assertion "non-zero GPU %" holds (it is non-zero whenever the
  card is busy and one AI container shows occupancy), but must not claim exact per-container GPU %.

### CPU and RAM from cgroup v2 versus `docker stats`
- CPU % (100 = one core, as `docker stats`) = `delta usage_usec / delta wall_us x 100`. Steady containers agree: comfyui 0.50 vs
  0.51, postgres 1.7 vs 1.3, web/embedder 0.0 vs 0.0. Over the run the burst-heavy ones differ only by the sampling window
  (docker stats polls every 8 s): keycloak 1.6 vs 4.3, llama-server 791 vs 911 (**791 % = about 8 cores while experts run
  on the CPU**, so "% of 32 threads" shows 25 %, with "8 cores" in text as the spec says).
- RAM = `memory.current - memory.stat inactive_file` equals `docker stats` within 5 MiB: comfyui 21274 vs 21279 MiB (ComfyUI
  holds 21 GB of host RAM), keycloak 1768 vs 1768, embedder 995 vs 995, web 47 vs 46.

### Mapping algorithm (verified end to end)
1. Every 5 s: `GET /containers/json` (running, filter rules above) -> `Map<cgroupScope, serviceName>` from the 64-hex id.
2. Every 5 s (and on a Docker change): read `cgroup.procs` of every scope -> PIDs; for PIDs not yet known, readdir `fd`, keep
   fds whose readlink is `/dev/dri/renderD*` or `/dev/kfd`.
3. Every tick: fdinfo of the known DRM fds, kfd `vram_*` and `stats_*/cu_occupancy`, cgroup `cpu.stat`/`memory.*`, card sysfs.
4. Drop PIDs that vanish (the llama child appears and disappears with model load/unload; counters of a gone PID reset the delta).
Verified mapping in the recording: pid 1185602 (router) and 1208225 (child) -> `llama-server`; pid 1185741 (`python3`) -> `comfyui`.

### Results for the spec
- Per-container **GPU % is approximate** (formula above); **VRAM, CPU and RAM are real**. Host strip: `mem_info_vram_used|total`,
  `gpu_busy_percent` (real), `/proc/stat`, `/proc/meminfo`.
- `drm-engine-*` is parsed if present (other hardware, desktop clients) and used when it moves; otherwise the kfd path.
- `SYS_PTRACE` is required; `DAC_READ_SEARCH` is not. ADR 0006 states it.
- Fixtures for phase D tests (`docs/spikes/assets/diagnostics-fixtures/`): `samples-excerpt.ndjson` (30 consecutive 1 s records at
  peak load, container PIDs only, trimmed drm lines, cgroup counters, kfd, card, `/proc/stat` line), `fdinfo-llama-server-pid*.txt`
  (router and child), `fdinfo-python3-pid1185741-fd7.txt` (ComfyUI), `fdinfo-kwin_wayland-*.txt` (host client with
  `drm-engine-gfx`, for the "ignore non-container PID" case), `containers-json.json`, `proc-cgroup-*.txt`,
  `cgroup-*-{cpu.stat,memory.stat,memory.current,cgroup.procs}`, `kfd-walk-comfyui-render.tsv`, `kfd-walk-llm-chat.tsv`.
- Stack state after A1: `llama-server`, `comfyui`, `embedder` stopped, api recreated on `AI_ADAPTERS=fake`; volumes untouched.

## A2. SSE through Nest and Next, and AsyncLocalStorage

### SSE chain (Nest in the API image, Next 16.4.6 standalone container, Chromium `EventSource`)
Setup: throwaway Nest app (`scripts/ai-spike/diag-spike/nest-sse/sse-server.ts`, one event every 50 ms, ring buffer of 3000, token header
check) in a container of the API image; throwaway Next app route handler `/stream` (standalone image, same Dockerfile pattern as the
web) on a user-defined network; a Chromium page (Playwright image 1.65.0, Chromium 1254) opens `new EventSource('/stream?...')` and
logs `Date.now()` on arrival versus the `ts` the server put in the payload (same host clock). Raw results:
`docs/spikes/assets/diagnostics-fixtures/a2-*.json|log`.
- Latency (steady state, last 100 events of each 8 s run): **p50 0 ms, p95 1 ms, max 1 ms**, max gap between events 51-53 ms for a
  50 ms producer, for all four combinations (Nest `@Sse` or raw `@Res`; Next route returning the upstream body, or an own
  `ReadableStream` that forwards `read()` and aborts upstream on `cancel()`). No buffering anywhere; `x-accel-buffering: no`,
  `cache-control: no-cache, no-transform` and `content-type: text/event-stream` pass untouched. The existing web proxy
  (`apps/web/src/lib/api-proxy.ts`) already streams `upstream.body` with the request signal, and the API already has one `@Sse`
  endpoint (`gpu-jobs/:id/events`), so the same pattern is proven in the repo.
- Replay of a 3000-event buffer on connect (about 280 B each incl. 200 B padding): delivered in one burst, first event first; no
  loss (latency numbers of the replay are meaningless: events are old by construction).
- **Reconnect with `Last-Event-ID`:** the server closed the stream after 41 live events; the browser reconnected by itself
  (`retry: 500` for raw, Chrome default about 3 s for `@Sse`), sent `Last-Event-ID`, the route forwarded it, the server replayed
  only `id > n`. Result in both Nest variants: **0 duplicates, 0 gaps** over 952 and 1207 events, `hello` repeated on each
  connection (so the client must treat `hello.bootId` as the reset signal). (A first run showed gaps; the cause was a
  throwaway bug, a `const` used before initialisation in the raw handler, fixed; the numbers above are from the fixed run.)
- **Keep-alive is mandatory (measured):** with a `: ping` comment every 15 s a stream with one event per 320 s stayed open for
  the whole 400 s test and delivered the 320 s event; **without pings the same stream was cut at exactly 301 s** (curl 18), the
  300 s body timeout of Node's `fetch` (undici) between Next and Nest. Spec value (15 s) is right; never go above 60 s.
- Nest facts that change the implementation: `@Sse` **assigns its own `id: <n>` to every event that has no `id`** (my `hello`
  came out as `id: 1`, which would reset the client's `lastEventId`), and it **cannot emit comment lines** (`: ping`), only events.
  Pings through `@Sse` are real `event: ping` frames that `EventSource` surfaces as events.
- **Decision:** the API stream endpoint is a raw `@Res()` SSE handler (explicit `id`, `retry: 500`, `: ping`, `flushHeaders`, `close`
  cleanup, `hello` without `id`), not `@Sse`. Consumer of the API/agent stream is the diagnostics server (an own `fetch` + line
  parser), so comments are free there. The Next `/stream` route uses its own `ReadableStream` (it has to merge several sources
  anyway) with `cancel()` aborting every upstream; plus `export const dynamic = 'force-dynamic'`. No query-string token anywhere.

### AsyncLocalStorage across the runner and the broker (unit prototype, 5 tests green)
Spec file `scripts/ai-spike/diag-spike/als/spike-als.spec.ts` (copy to `apps/api/test/` to run), against the REAL
`GpuJobBrokerService`, `GpuResidencyHook` and a Nest app with Express middleware (supertest):
1. **Control (unpatched broker): job B, submitted in context `corr-B` while job A runs, starts inside A's `finish()` and runs
   with `corr-A`.** This is the leak the spec predicted (`pump()` is called from the previous job's settle callback).
2. Patched: ids captured where `submit` creates the job (`options.newId` is called synchronously in `submit`, before `pump`, which
   is where the prototype stored `als.getStore()`; production: add `ctx` to `JobRecord` in `submit`) and `start(job)` wrapped in
   `als.run(job.ctx, ...)`. Result: B's run function, its `await setTimeout`, the residency hook (`beforeImage`), and the `running`
   and `done` events all see `corr-B`; `queued` is emitted in the submitter's context.
3. Timeout path: the timer created in `start` and the `failed` event keep the job's context (`queued:corr-T`, `running:corr-T`,
   `failed:corr-T`). The timer inherits the re-entered context, so `finish` from a timeout is attributed correctly.
4. Runner-like chain (await, `Promise.all` of 3 jobs, microtask, timer, fire-and-forget async function): all 12 trace points `corr-R`.
5. Express middleware `als.run(id, next)` + Nest controller + service + broker job + `setTimeout` background chain, two concurrent
   requests: each sees its own id before the job, inside the job, after it and in the background timer.
Implementation rule for phase B/C: the broker change is two lines (capture `als.getStore()` into `JobRecord.ctx` in `submit`,
`als.run(job.ctx, () => this.start(job))` in `pump`). `afterImage()` runs in `finish()` from the job's own chain, so it keeps the id.
Prisma/pg: the `$extends` query hook runs in the caller's async context (our code), so no extra work; not exercised against a pool here.

## A3. Graph library (`@xyflow/react`)
Setup: throwaway app (`scripts/ai-spike/diag-spike/graph-app/`, Next 16.4.6 + React 19.3.1 + `@xyflow/react` 12.12.1 exact) with a
`/graph` page: 25 custom nodes (title 14 px, model line, three typed pins in and out, four-stat widget row, 200 px wide), 25 custom
bezier edges (dashed `stroke-dashoffset` animation plus a travelling dot via `offset-path`), a 6 x 5 grid fitted to 1920x1080.
`pnpm install` once (lock diff only adds the packages below), `docker build` of the standalone image (401 MB; the web image is 405 MB;
build 14 s warm), run in a container, measured in the pinned Playwright Chromium with **software rasterisation (headless, no GPU)**,
so numbers are a conservative bound for the presenter's GPU browser. 10 s per variant after 2.5 s warm-up, frame time from
`requestAnimationFrame`, CPU from CDP `SystemInfo.getProcessInfo` (all browser processes). Raw: `a3-graph-bench*.json`;
screenshot `docs/spikes/assets/diagnostics-graph-spike-1920.png`.

| Variant (25 nodes, 25 edges, 150 handles) | fps | p95 / max frame | frames over 20 ms | main thread busy | all-process CPU |
|---|---|---|---|---|---|
| all dim (static) | 60.1 | 16.7 / 16.8 ms | 0 | 0.4 % | 0.01 cores |
| 6 active edges + dots + CSS glow, 10 node updates/s (realistic) | 60.0 | 16.7 / 16.8 ms | 0 | 10.3 % | 1.48 cores |
| same, no glow | 60.0 | 16.8 / 16.8 ms | 0 | 7.8 % | 0.90 cores |
| same, glow as a wide under-stroke (`glow=2`) | 60.2 | 16.8 / 16.8 ms | 0 | 8.4 % | 0.95 cores |
| 25 active + CSS `drop-shadow` glow, no updates (worst case) | 43.1 | 33.4 / 33.4 ms | 170 | 4.0 % | 3.65 cores |
| 25 active + dots + glow, 30 updates/s | 40.8 | 33.4 / 33.5 ms | 193 | 18.5 % | 3.88 cores |
| 25 active + dots, no glow, 30 updates/s | 60.1 | 16.8 / 16.8 ms | 0 | 16.1 % | 2.10 cores |
| 25 active + dots + under-stroke glow, 30 updates/s | 60.2 | 16.8 / 16.8 ms | 0 | 17.1 % | 2.28 cores |
- **Go.** Even the unrealistic all-25-active case holds 60 fps as long as edges carry no CSS `filter: drop-shadow`; the filter is the
  only cost (software raster: 43 fps and 3.7 cores). Rules for phase E: only edges with an open span animate (idle edges are static
  and dim), glow is a second wider low-opacity stroke, not `filter`; one `will-change` is not needed.
- **Pitfall found (affects the node design):** rebuilding the `nodes` array with new objects each tick (to push CPU/working state
  into `node.data`) made React Flow lose the measured node sizes and **all edges vanished (0 `.react-flow__edge`)**. Keep `nodes` and
  `edges` referentially stable and read live state inside the node/edge components from a context or store (what the final run did);
  `useSyncExternalStore` selectors per node keep re-renders at one node per event.
- Offline: **0 requests outside `localhost` in every run** (the only host seen is the page origin; the React Flow CSS and the D3 code are
  bundled, no web font or CDN). Build needs the registry once (`pnpm install`); the runtime image does not.
- Versions and licences added to the lockfile (all permissive): `@xyflow/react` 12.12.1 MIT, `@xyflow/system` 0.0.84 MIT,
  `zustand` 4.5.7 MIT, `classcat` 5.0.5 MIT, `use-sync-external-store` 1.7.0 MIT, `d3-selection` 3.0.1, `d3-drag` 3.0.1, `d3-zoom` 3.0.1,
  `d3-transition` 3.0.2, `d3-dispatch` 3.0.2, `d3-timer` 3.0.2 (ISC), `d3-ease` 3.0.2 (BSD-3-Clause), and `@types/d3-*` (MIT dev).
  The throwaway app was removed and `pnpm-lock.yaml` restored; phase E re-adds exactly these pins.
- Attribution: React Flow asks for a small attribution; the spike used `proOptions={{ hideAttribution: true }}` for the screenshot. Decide in
  phase E whether to keep it visible (the MIT licence does not require it, the maintainers ask for it).

## Final recommended design (changes versus the spec)
1. **GPU % per container is approximate by construction** (Decision 7 amended): global `gpu_busy_percent` attributed by KFD `cu_occupancy`
   share, always `approx: true`; `drm-engine-*` parsed but expected absent for ROCm. VRAM per container real (fdinfo `drm-memory-vram`
   summed over every PID of the cgroup, distinct `drm-client-id`; kfd `vram_*` fallback). CPU and RAM real from cgroup v2 (same numbers as
   `docker stats`).
2. **Agent privileges:** `user: root`, `cap_drop: [ALL]`, `cap_add: [SYS_PTRACE]` (required, tested), no `DAC_READ_SEARCH`, `read_only`,
   `no-new-privileges`, `/sys:ro`, Docker socket `:ro`, `pid: host`, `cgroup: host`. Add to the risks table that without `SYS_PTRACE`
   the AI nodes show no VRAM.
3. **Container identity filter:** require `com.docker.compose.container-number`, `oneoff=False`, running state and the agent's own
   `com.docker.compose.project`; newest `Created` wins (compose-built images leak `project` and `service` labels onto any container started
   from them, and recreated services briefly exist twice).
4. **Agent tick:** discover PIDs and DRM fds every 5 s (40 ms), read known PIDs every tick (1 ms), sample kfd `cu_occupancy` four times per
   second and average to the 1 s sample. `llama-server` router mode: always sum over every PID in the cgroup (parent plus per-model child).
5. **SSE:** raw `@Res()` handler in the API (explicit ids, `: ping` every 15 s, `retry: 500`, `hello` without id); Next route with an own
   `ReadableStream`; no-keep-alive streams die at 301 s, so keep-alive and `Last-Event-ID` resume are mandatory (both proven end to end).
6. **ALS:** capture the context in `submit` and re-enter it in `start` (the unpatched broker really leaks the previous job's id); two lines in
   the broker; tests as in the prototype become the phase B/C `correlation` and broker tests.
7. **Graph:** `@xyflow/react` 12.12.1 exact; stable `nodes`/`edges` arrays with live state through a store; animate only active edges; glow as
   an under-stroke, never `filter: drop-shadow`; custom SVG renderer fallback is not needed (OQ-5 fallback stays unused).

## Not run
- Real-GPU run of the finished agent and dashboard (phase D `gpu-check.sh`, phase F).
- Non-AMD GPUs; browsers other than Chromium (Firefox/WebKit are in the pinned image, not exercised); a GPU-accelerated browser for A3
  (software raster used as a conservative bound).
- 1440x1080 and 1366x768 rendering of the graph (phase E, depends on the design read-back).
