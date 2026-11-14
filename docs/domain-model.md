# Domain Model

Terms as defined in `CONTEXT.md`.

## Core Concepts

- **Account**: identity in Keycloak (role: User, Professional, or Administrator), plus a local profile with preferred locale.
- **Company**: Tax ID, legal name, corporate email domain, status. Has one or more Professionals.
- **Kitchen Project**: owned by one Homeowner. Holds Photos, Measurements, Moodboard, Renders, Budget, and its chosen path.
- **Photo / Render / PDF**: binary objects stored in MinIO; the database stores keys and metadata. A Photo (`kitchen_photo`) is stored only as a normalized, metadata-free JPEG `full` (longest edge <= 2560, orientation applied) plus a `thumb` (<= 512); it keeps its 0-based `position` in the Kitchen Project, the `full` width/height and byte size. The uploaded original (including any GPS data and the file name) is never stored. Accepted inputs: JPEG, PNG, WebP, HEIC/HEIF; at most 8 per Kitchen Project, 15 MB each, shortest edge >= 480 px.
- **Moodboard / Moodboard Item** (`moodboard_item`, `moodboard-selection`): an ordered set of at most 12 Moodboard Items per Kitchen Project (0-based, compacted `position`). An item is either `gallery` (a Style Gallery image id, no stored objects; one item per image per Kitchen Project) or `upload` (an own reference photo stored exactly like a Photo: metadata-free `full` + `thumb` JPEGs under `kitchen-projects/<projectId>/moodboard/<itemId>/`, same input rules). "Selected" means "in the Moodboard"; nothing unselected is stored. Removing an upload deletes its objects. Items live and expire with the draft Kitchen Project (cascade delete; the sweeper also deletes their objects); every change slides the draft expiry.
- **Style Gallery**: 24 committed, synthetic kitchen images (8 styles x 3; ids such as `scandinavian-01`, stable and never reused) with a manifest; not a database table. Served by the API from files.
- **Measurements**: room Length x Width x Height stored as whole centimetres (length/width 100-2000, height 180-600; each null until entered). The UI shows metres with 2 decimals or centimetres, locale-formatted.
- **Budget**: four Budget Tiers; each tier is a list of Line Items. Totals are derived, never stored as LLM output.
- **Line Item**: product name, SKU, Catalog, source reference (document + page/chunk), cited unit price, quantity, unit, subtotal (computed).
- **Chat Session**: messages between Homeowner and the budget assistant, with the active Persona per message.
- **Render** (`kitchen_render`, `controlnet-render`): one SDXL + ControlNet image of a claimed Kitchen Project from one of its Photos and the dominant Moodboard style. Three metadata-free JPEG objects in MinIO under `kitchen-projects/<projectId>/renders/<renderId>/`: `before.jpg` (the Photo centre-cropped to the nearest SDXL bucket: 1216x832, 832x1216 or 1024x1024; also the model input), `full.jpg` (same size as `before`) and `thumb.jpg` (longest edge 512). The row keeps the source Photo (set to null if that Photo is ever deleted), style, ControlNet mode, size, and internal provenance (prompt, seed, GPU job id) that no route returns.
- **Dossier**: immutable snapshot of a Kitchen Project at publication (Renders, Measurements, selected tier, Line Items).
- **Bid**: Company, Dossier, managing Professional, price, guaranteed installation date, delay penalty per day, version history.
- **Contract**: accepted Bid, generated PDF, PDF SHA-256, two Electronic Acceptance records, commission amount.
- **Commission Payment**: Contract, amount, Payment Mode used, status.
- **Quota Usage**: per Account per day, counters for LLM calls and image generations; optional per-Account override.
- **Platform Settings**: AI endpoints, MinIO credentials, Payment Mode, Quota Flag and global limits, Bidding Window duration, commission %, minimum penalty.

## Relationships

- Homeowner 1—N Kitchen Project.
- Kitchen Project 1—0..N Render; Render N—0..1 Photo (the source).
- Kitchen Project 1—0..1 Dossier (republishing an expired Dossier creates a new Dossier).
- Company 1—N Professional; Professional N—1 Company (exactly one).
- Dossier 1—N Bid; Company 1—0..1 Bid per Dossier.
- Bid N—1 managing Professional (the creator); other Professionals of the same Company have read-only access.
- Dossier 1—0..1 Contract; Contract 1—1 accepted Bid.
- Contract 1—0..1 Commission Payment.

## States and Lifecycles

**Account (Professional)**
`pending_validation` → `active` (Administrator approves Company) | `rejected` (Administrator rejects). `active` → `disabled` (Administrator).

**Company**
`pending_validation` → `validated` | `rejected`. A new Professional whose Tax ID matches a validated Company is linked to it by the Administrator.

**Kitchen Project**
`draft` (anonymous allowed; expires 7 days after its last change unless claimed) → `claimed` (Login Gate passed, bound to the Account) → `budgeted` (Budget exists) → `diy_completed` (Shopping List generated) or `published` (Dossier created) → `contracted` (Contract binding).

Claim rules (`login-gate-claim`): only a Homeowner (realm role `user`) claims, with the browser's draft token. The claim keeps the row (same id and content), sets the owner (Keycloak `sub`, there is no local Account table yet), `claimed_at`, and clears the expiry, so a claimed project is never swept. The token hash stays: the same Account repeating the claim gets the same project; another Account, or an unknown or expired token, gets 404. The draft routes no longer accept the token. A claimed project is read-only until later features add editing. A Homeowner owns 1-N Kitchen Projects (no limit).

**Ready for generation**: at least one photo, all three Measurements and at least one Moodboard Item (the Moodboard Continue rule). The costly actions (Render, Budget) answer 409 `project_incomplete` otherwise; until `budget-tier-computation` the Budget answers 501 `not_available_yet`.

**Render** (`controlnet-render`)
`queued` → `running` → `succeeded` | `failed` (`adapter_error`, `timeout`, `interrupted`, `storage_unavailable`). Rules: only the owner creates and reads Renders; at most one `queued`/`running` Render per Kitchen Project (409 `render_in_progress`); at most `RENDER_MAX_PER_PROJECT` (10) non-failed Renders per project (409 `render_limit_reached`; failed ones do not count); every request uses a new random seed and the history is kept, newest first. GPU jobs live in memory, so on API start every `queued`/`running` Render becomes `failed`/`interrupted`. A failed Render keeps only its `before` object. Renders are never deleted or edited yet.

**Dossier**
`open` → `accepted` (Homeowner accepts a Bid) | `expired` (Bidding Window ends with no acceptance) | `withdrawn` (Homeowner). Content is immutable in every state.

**Bid**
`submitted` → `revised` (each edit creates a new version, notifies the Homeowner by SSE) → `accepted` | `not_selected` (another Bid accepted) | `closed` (Dossier expired or withdrawn). Editable only while the Dossier is `open`.

**Contract**
`generated` → `accepted_by_homeowner` / `accepted_by_company` (either order) → `binding` (both accepted) → `commission_pending` → `commission_paid`.

## Important Scenarios

1. Anonymous visitor uploads photos, enters Measurements (Capture), builds a Moodboard from Style Gallery picks and own reference photos (Continue needs at least 1 item and a complete Capture); requests a Render; the Login Gate appears; after sign-in the draft is claimed by the new Account.
2. Homeowner switches Persona mid-chat; the next answer uses the new system prompt; Budget totals are unchanged unless Line Items change.
3. Homeowner picks "Medium" through a Prompt Macro; the chat receives a structured prompt; the backend recomputes the tier from Line Items.
4. Professional of a validated Company submits a Bid; a co-worker sees it read-only; the managing Professional lowers the price; the Homeowner receives an SSE alert.
5. Homeowner accepts a Bid; the Dossier closes; other Bids become `not_selected`; the Contract PDF is generated; both parties complete Electronic Acceptance; Company identity is revealed to the Homeowner.
6. Commission checkout runs in the active Payment Mode (Simulated records `commission_pending`; PayPal Sandbox redirects and confirms).
7. Administrator resets a Homeowner's daily counter during a demo; the next costly call succeeds.

## Edge Cases

- A cited unit price is not found in the retrieved Catalog chunk: the Line Item is rejected and the assistant must retry or flag it; no unverified price reaches a total.
- Quota exhausted mid-session: the costly action is blocked with a clear message; free actions still work.
- Professional of a Company still `pending_validation` tries to view Dossiers: denied.
- Two Professionals of the same Company try to bid on one Dossier: the second sees the existing Bid read-only.
- Homeowner accepts a Bid at the same moment it is revised: acceptance binds to the Bid version shown when accepting.
- GPU busy with a Render while a chat message arrives: the request waits in the queue (see GPU serialization in `docs/technical-discovery.md`).
- Network drops during Google SSO or PayPal: user falls back to password login / Simulated payment without data loss.
