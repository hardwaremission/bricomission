# Design Read-Back: diagnostics-dashboard

Approved by developer on 2026-11-15.

- Source of truth: `design/openpencil/bricomission_diagnostics.fig` (own file, desktop, dark blueprint look), designed and read back through the `open-pencil` MCP. Pages and frames:
  - **Dashboard**: `D1` idle with the log expanded, `D2` active (a Simulation rendering photo 3 of 6) with the live log, `D3` the same active state with the log collapsed to a 44 px rail. All 1920x1080.
  - **Nodes and Widgets**: `N1` node anatomy (6 numbered callouts), node states, widget variants, connection styles, the **routing rule**.
  - **Log**: `L1` log line variants, `L2` the budget prompt expanded and the kind filter menu.
  - **States and Checks**: `ST1` header status chips and setup cards, `CK` responsive layouts (1440x1080, 1366x768 with the log open and collapsed; schematic at 50 %).
- Exports in `design/openpencil/diagnostics-dashboard/`:
  - `layout-reference.json`: **the exact layout** of the graph canvas (1360x1024 at 1:1): every node rect, the six gutters, the comment-box rects and the 24 orthogonal edge polylines. The implementation must reproduce this arrangement (same columns, same order, same lanes).
  - `ck-responsive-checks.jsx`, `l1-log-line-variants.jsx`, `l2-budget-prompt-and-filters.jsx`, `st1-status-and-setup-states.jsx`: complete JSX read-backs.
  - `parts/*.jsx`: the large frames exported in pieces (the MCP export truncates at 12 KB): header, comment boxes, edges (idle and active), container nodes, AI nodes and API widget, legend, idle log, collapsed rail, a module node template, node anatomy, widget variants, states and connection styles. The 14 module nodes and the live log rows share the templates in `parts/d2-module-node-template-*.jsx` and `l1`/`l2`; positions come from `layout-reference.json`.
  - `overview-*.png`: full renders.
- Product decisions: spec `docs/specs/diagnostics-dashboard.md` (OQ answers recorded at its end) and the phase A results in `docs/spikes/diagnostics-metrics-spike.md`. Designs are English only. Implement strictly from this artifact.

## Visual language (blueprint, Unreal Engine style)

| Token | Value |
| --- | --- |
| Page / canvas / panel | `#080E1A` / `#0B1220` / `#0E1626` |
| Node body, input well | `#101A2B`, `#0A1020` |
| Strokes | `#2A3A55` default, `#1C2A44` panels |
| Text | `#E6EDF7` strong, `#CBD5E1` body, `#8A9BB5` muted, `#7E8DA6` dim (n/a; at least 4.5:1) |
| Accent | `#2968EC` (brand), `#5B9BFF` active, `#3B5A9A` recently active |
| Pin and edge colours | http `#4F8EF7`, sql `#F5A524`, object `#FB923C`, llm `#A78BFA`, image `#F472B6`, embed `#22D3EE`, auth `#F87171`, mail `#4ADE80`, queue `#FACC15`, compute `#5EEAD4`, step `#94A3B8` |
| Metric colours | CPU `#5B9BFF`, RAM `#4ADE80`, VRAM `#A78BFA`, GPU `#FACC15` |
| State colours | ok `#4ADE80`, warning `#FACC15`, error `#EF4444` |
| Category headers | web `#2968EC`, client `#475569`, API modules `#0F766E`, identity and mail `#BE123C`, data `#B45309`, AI GPU `#6D28D9`, AI CPU `#0E7490` |
| Fonts | Inter (UI), JetBrains Mono (values, models, log). Self-hosted in the app (for example `@fontsource/*`), no network request at runtime |
| Radius | nodes 8, panels 12 to 14, chips 999 |

No blur, glow, shadow-as-light or gradient anywhere on lines or nodes (developer decision 2026-11-15). Cards that float (menus, setup cards, tooltips) may keep a plain drop shadow.

## Layout (D1, D2, D3)

- Header 56 high: brand mark, `DIAGNOSTICS` tag, host strip (CPU, RAM, VRAM of 16 GB, GPU, real host values), status chip, `Legend` button, `Fit` button.
- Canvas (graph) at x 0, y 56, width = 1920 minus the log. Log panel 560 wide on the right (`D1`, `D2`), or a 44 px rail (`D3`) after collapsing; the graph then recentres (fit view).
- Graph space (1:1, 1360 wide): columns left to right with 40 px gutters: browser (108), web (140), api-guards (136), services (136), helpers (136), clients (136), external containers (312). Positions are in `layout-reference.json`. Comment boxes (groups): Client, Web container, API (NestJS), Identity and mail, AI inference, Data. The API box has no sub-boxes; a 3 px left strip on each module marks its group (request `#14B8A6`, generation `#84CC16`, budget `#38BDF8`, GPU `#FACC15`, infra `#94A3B8`).
- The legend card (open by default at 1920 wide, collapsed into the header button at 1440 and below) sits bottom-left of the canvas, 284 wide, and never overlaps a line or a node.
- The graph always starts in fit view; the Fit button restores it. Pan and zoom are free.

## Routing rule (normative)

Every connection is made of horizontal and vertical segments with 90 degree corners only. Lines run in the gutters between node columns (about 6 px between parallel lines, at most 5 lanes per gutter) and in free channels above (y 6, 12) and below (y 1014) the graph for the long connections. **They never pass over or under a node, widget, legend or comment-box title.** Crossings between two lines are allowed and are always perpendicular. Lines that start at the same pin share their first segment. Straight lines are used wherever source and target pins align. Implement with an orthogonal layered layout (elkjs, ELK layered with orthogonal edge routing and one port per pin; pinned version, works offline) seeded with the positions of `layout-reference.json`, and add a test that checks every routed segment against the node boxes.

## Nodes (N1)

- **Container node:** header 24 (category colour, name, GPU or CPU badge, state chip LOADED, UNLOADED, WARM, BUSY, ERROR, OFFLINE), model block (names read from the real config, one line per model), widget, last-activity line, typed pins (inputs on the left, outputs on the right). AI nodes: `llama-server` (Qwen3-VL-30B-A3B-Instruct Q4_K_M + mmproj F16, id `qwen3-vl`, experts on CPU, ctx 16384, router), `comfyui` (RealVisXL_V5.0_fp16, ControlNet sdxl-canny and sdxl-depth, IP-Adapter plus_sdxl_vit-h, CLIP vision ViT-H-14), `embedder` (Qwen3-Embedding-0.6B Q8_0, 1024 dimensions). Containers without GPU show `VRAM, GPU: n/a`.
- **Module node (14, 136x56):** header 22 (name, state dot), left group strip, sub line (10 px mono), counter line (own real counter, for example `req 128`, `render 3 of 6`), typed pins. API module widgets show no CPU or RAM of their own: the single `API TOTALS · shared` widget in the API box shows the container values (decision OQ-2).
- **Client node:** Browser PWA, `metrics: n/a`.
- **Widget:** four tiles CPU %, RAM, VRAM, GPU % (label 9 px, value 12 px mono, 3 px bar in the metric colour). Variants: normal; 90 percent or more (bar and value red); `approx` (tag APPROX); `shared`; `n/a` (not measurable, dim, never a made-up number); `no agent` (dash plus NO AGENT tag). Values refresh every second. **GPU % of the AI nodes is approximate** (spike A1: the global busy % attributed by compute-unit occupancy): show the value with a `~` prefix (`~87%`) and the APPROX explanation in the legend; the host strip GPU is exact. VRAM, CPU and RAM are exact.
- **States:** idle (grey dot, 1 px border), working (solid 2 px `#5B9BFF` border, blue dot), recently active (`#3B5A9A` border for about 3 s), error (red border, red dot, 3 s then idle), offline (dimmed, last seen time), selected (white 2 px border; also filters the log to events involving the node, Esc clears).
- Hover on a pin: tooltip with the pin type and the latest call summary.

## Connections (N1, D2)

Idle: 2 px `#2A3A55`. Active: 3 px solid line in the pin-type colour plus a short white light packet (22 to 26 px long, 4 px thick) that travels from source to target along the polyline (about 600 ms per hop); the line stays coloured until the response arrives. Response: the packet travels back and the line is green, fading out over 1 s. Simulated (fake adapters): dashed, with a legend entry. Error: solid red for 3 s with an X mark at the midpoint, target node red. Reduced motion: no travelling packet, three fixed white marks on the lit line; the log carries the narration. Do not use shadows, blur or opacity gradients.

## Log panel (D1, D2, D3, L1, L2)

- Header 52: terminal icon, `Event log`, event count, Pause, Clear, Collapse. Filter row 44: `All`, `llm`, `image`, `queue`, `sql`, `http`, `+9` menu (the count of kinds that are not chips; the design frame reads `+7`) with all 14 kinds (checkboxes, pin colours) and the note that selecting a node filters the log.
- **Row (58 collapsed):** 3 px kind bar in the pin-type colour; time (mono, `HH:MM:SS.mmm`); FROM chip; arrow; TO chip; optional ms; KIND badge; second line the summary in plain words. Node chip colours follow the node category (API modules teal, AI violet, identity rose, data amber, web blue, browser grey). Expanded rows add a payload box (mono, scrolls, Copy and Wrap): the model prompt in full with image thumbnails and sizes (D2 style description, L2 budget prompt with system, inventory, price bands and retrieved excerpts), the ComfyUI request (positive and negative prompt, ControlNet and IP-Adapter settings, reference thumbnails), vector search hits with scores.
- Row variants (L1): correlation thread header (`sim-7f3a · POST /simulations`), coalesced SQL group (`SQL x8`), vector search hits, budget-math compute (accepted and rejected items, tiers ordered), mail with the `INFERRED` tag (subject only, never the code), error (red border, `FAILED`, ok false), gap row (`128 poll events grouped`), system row (`SYSTEM`, no correlation id), the live row (`NOW`, blue border).
- Auto-scroll to the newest at the bottom; when the user scrolls up the footer shows `Jump to live`. Footer: `buffer n / 1000 · stream connected`.
- Collapsed (D3): 44 px rail with Expand, an unread badge (`+41`), a live dot, tick marks. The graph keeps updating.

## States (ST1)

Status chip: LIVE, RECONNECTING (graph dims, back-off, resumes from the last event id), API DISABLED (setup card with `./launch-demo.sh`), NO AGENT (widgets dash), REPLAY (recorded run, dashed edges), TOKEN MISMATCH (401, setup card). Cards: connection lost with `Retry now`, diagnostics off in the API, token rejected. Empty log: `Waiting for activity`.

## Responsive (CK)

1920x1080 reference (graph 1360, log 560, legend open). 1440x1080: log 480, legend collapsed into the header button, fit-view zoom about 0.7. 1366x768: log 400, legend collapsed, fit-view about 0.7. Below 1280 px the log starts collapsed. Micro labels are 9 px in the design at 100 percent; at fit-view zoom the implementation keeps them at least 9 px effective. Everything that makes room for the bigger labels is 0 at 100 percent, so 1920x1080 is the design unchanged; below 100 percent: the value and bar of every metric tile move down by the extra label height (the label line always ends above the value), the APPROX tag follows the micro labels (7 px at 100 percent, 9 px effective below), the four tiles of the AI nodes close up (pitch 74 to about 67) so `GPU` plus APPROX stays inside the node, and the API TOTALS card widens (128 to about 147) so its title stays on one line. The filter row is one 44 px row when the chips fit and wraps to a second row in the 400 px log (and with the node chip); the kinds menu opens under the row, inside the panel.

## Deviations and notes for the implementation

- Lint of the design flags small text (9 to 11 px) and the dim `n/a` tone; the design is a desktop presenter tool shown at 1920x1080. Keep the sizes as designed; use `#7E8DA6` for n/a.
- The two long edges `data-access` to postgres and `storage-client` to minio are straight in the design because the pins align; the implementation keeps them straight (layout test).
- Icons: Lucide via the dashboard's own dependency (`activity`, `terminal`, `pause`, `trash-2`, `panel-right-close`, `panel-right-open`, `layout-list`, `scan`, `chevron-up`, `chevron-down`, `arrow-right`, `arrow-down-to-line`, `copy`, `wrap-text`, `radio`, `wifi-off`, `power-off`, `key-round`, `rotate-ccw`, `gauge`, `loader`, `refresh-cw`, `ellipsis`, `git-commit-horizontal`).
- Test ids stay as in the spec: `edge-<from>-<to>` (with `data-active`, `data-kind`, `data-last-seq`) and `log-line-<seq>`.

## Deviations of the implementation (2026-11-15, feature diagnostics-dashboard)

- **Routing: the reference polylines of this design, not ELK.** `elkjs` (layered, orthogonal, fixed ports seeded with the reference rectangles) moved all 23 nodes (up to 736 px) and matched 0 of 24 routes, and its `fixed` algorithm does not route. The implementation draws every edge on the polyline of `design/openpencil/diagnostics-dashboard/layout-reference.json` (`apps/diagnostics/src/graph/layout-reference.json` is a byte copy, guarded by a drift test) and places every node at its exported rectangle. Nodes are not draggable, so the routes stay valid. No `elkjs` dependency (ADR 0006).
- **Pin colours follow the edge type of the API topology.** Pins are derived from the polyline endpoints, so `residency-hook > llama-server` has an `llm` (violet) pin where the design drew an `http` (blue) one.
- **Active edge colour is the pin-type colour** (the normative text above); frame D2 draws the http hops in `#5B9BFF`. Recently active edges and nodes use `#3B5A9A` for every kind (D2 also shows a dimmed violet). Polling only marks an edge as recently active, without a packet. The legend adds the `step` pin colour and one sentence for `~ approx`, and sits 8 px above the canvas bottom.
- **`n/a` tone** is `#7E8DA6` as noted above. Containers the design shows with "VRAM, GPU: n/a" keep that line even when the agent measures 0; the embedder shows the measured `0 MB` / `0%`. RAM total reads `63 GB` (64204 MiB).
- **AI node flags line** reads `MoE experts on CPU · ctx <LLAMA_CTX_SIZE> · router, one model at a time`; the context size comes from the API topology and is omitted when unknown. `mmproj` is shortened to `F16`.
- **Module counters** are real counts or narrated progress; the example texts of the design (`weights 43/34/23`, `stage idle`) are not reproduced.
- **Log:** the thread tag is `<first 6 hex of the correlation id> · <first summary> · HH:MM:SS` (the `sim-7f3a` prefix has no data source); a response row reads `reply · ...` in its travel direction; fake-adapter rows carry a `SIMULATED` tag; the filter button reads `+9`, the real number of kinds that are not chips (14 kinds, 5 chips), where the design wrote `+7`. The page draws the last 300 rows (`Show older`).
- React Flow's attribution link stays at the bottom right of the canvas.
