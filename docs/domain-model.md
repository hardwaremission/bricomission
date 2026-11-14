# Domain Model

Terms as defined in `CONTEXT.md`.

## Core Concepts

- **Account**: identity in Keycloak (role: User, Professional, or Administrator), plus a local profile with preferred locale.
- **Company**: Tax ID, legal name, corporate email domain, status. Has one or more Professionals.
- **Kitchen Project**: owned by one Homeowner. Holds Photos, Measurements, Moodboard, Renders, Budget, and its chosen path.
- **Photo / Render / PDF**: binary objects stored in MinIO; the database stores keys and metadata. A Photo (`kitchen_photo`) is stored only as a normalized, metadata-free JPEG `full` (longest edge <= 2560, orientation applied) plus a `thumb` (<= 512); it keeps its 0-based `position` in the Kitchen Project, the `full` width/height and byte size. The uploaded original (including any GPS data and the file name) is never stored. Accepted inputs: JPEG, PNG, WebP, HEIC/HEIF; at most 8 per Kitchen Project, 15 MB each, shortest edge >= 480 px.
- **Measurements**: room Length x Width x Height stored as whole centimetres (length/width 100-2000, height 180-600; each null until entered). The UI shows metres with 2 decimals or centimetres, locale-formatted.
- **Budget**: four Budget Tiers; each tier is a list of Line Items. Totals are derived, never stored as LLM output.
- **Line Item**: product name, SKU, Catalog, source reference (document + page/chunk), cited unit price, quantity, unit, subtotal (computed).
- **Chat Session**: messages between Homeowner and the budget assistant, with the active Persona per message.
- **Dossier**: immutable snapshot of a Kitchen Project at publication (Renders, Measurements, selected tier, Line Items).
- **Bid**: Company, Dossier, managing Professional, price, guaranteed installation date, delay penalty per day, version history.
- **Contract**: accepted Bid, generated PDF, PDF SHA-256, two Electronic Acceptance records, commission amount.
- **Commission Payment**: Contract, amount, Payment Mode used, status.
- **Quota Usage**: per Account per day, counters for LLM calls and image generations; optional per-Account override.
- **Platform Settings**: AI endpoints, MinIO credentials, Payment Mode, Quota Flag and global limits, Bidding Window duration, commission %, minimum penalty.

## Relationships

- Homeowner 1—N Kitchen Project.
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

**Dossier**
`open` → `accepted` (Homeowner accepts a Bid) | `expired` (Bidding Window ends with no acceptance) | `withdrawn` (Homeowner). Content is immutable in every state.

**Bid**
`submitted` → `revised` (each edit creates a new version, notifies the Homeowner by SSE) → `accepted` | `not_selected` (another Bid accepted) | `closed` (Dossier expired or withdrawn). Editable only while the Dossier is `open`.

**Contract**
`generated` → `accepted_by_homeowner` / `accepted_by_company` (either order) → `binding` (both accepted) → `commission_pending` → `commission_paid`.

## Important Scenarios

1. Anonymous visitor uploads photos, enters Measurements, builds a Moodboard; requests a Render; the Login Gate appears; after sign-in the draft is claimed by the new Account.
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
