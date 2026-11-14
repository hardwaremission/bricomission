// Type-only contracts shared across BricoMission packages.
// Consumers must use `import type`; this package ships no runtime code.

/** Overall API health. */
export type HealthStatus = 'ok' | 'error';

/** Reachability of the PostgreSQL database from the API. */
export type DatabaseStatus = 'up' | 'down';

/** Body of `GET /health`. */
export interface HealthResponse {
  status: HealthStatus;
  database: DatabaseStatus;
}

/** Keycloak realm roles of realm `BricoMission` (`realm_access.roles` in the access token). */
export type RealmRole = 'user' | 'professional' | 'admin';

/** Body of `GET /me`: the authenticated caller as seen by the API. */
export interface MeResponse {
  /** Keycloak user id (`sub`). */
  sub: string;
  /** Keycloak `preferred_username`. */
  username: string;
  /** Account email, or null when the token carries none. */
  email: string | null;
  /** Realm roles of the caller, limited to the BricoMission roles. */
  roles: RealmRole[];
}

/** Body of `GET /admin/ping` (admin-only liveness probe). */
export interface AdminPingResponse {
  status: 'ok';
}

/** Kind of GPU work: `image` runs exclusively, `llm` may share the GPU with other LLM jobs only. */
export type GpuJobKind = 'image' | 'llm';

/** Lifecycle of a GPU job: `queued -> running -> done | failed`. */
export type GpuJobStatus = 'queued' | 'running' | 'done' | 'failed';

/** Public failure code of a GPU job. Adapter messages are never exposed. */
export type GpuJobErrorCode = 'adapter_error' | 'timeout';

/** Body of `GET /ai/jobs/:id`. Timestamps are ISO-8601 strings. */
export interface GpuJobView {
  id: string;
  kind: GpuJobKind;
  status: GpuJobStatus;
  /** 1-based position in the queue while `queued`, otherwise null. */
  position: number | null;
  /** Kind of work the job is waiting behind while `queued`, otherwise null. */
  waitingFor: GpuJobKind | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: GpuJobErrorCode | null;
}

/** One SSE status event of `GET /ai/jobs/:id/events` (`seq` is the SSE `id`). */
export interface GpuJobEvent {
  jobId: string;
  seq: number;
  status: GpuJobStatus;
  position: number | null;
  waitingFor: GpuJobKind | null;
  at: string;
  errorCode: GpuJobErrorCode | null;
}

/** One chunk returned by `GET /catalog/search`, with its Catalog source reference. */
export interface CatalogSearchResult {
  chunkId: string;
  documentId: string;
  /** PDF Title metadata, else the file name without `.pdf`. */
  catalogName: string;
  /** Source PDF file name (basename). */
  fileName: string;
  /** 1-based page number in the source PDF. */
  pageNumber: number;
  text: string;
  /** Cosine similarity between the query and the chunk (higher is closer). */
  score: number;
  /** True when the chunk contains a SKU-like token of the query verbatim (ranked first). */
  matchedSku: boolean;
}

/** Body of `GET /catalog/search`. */
export interface CatalogSearchResponse {
  query: string;
  results: CatalogSearchResult[];
}

// --- Kitchen capture draft (feature kitchen-capture-draft) ---

/**
 * Lifecycle state of a Kitchen Project: `draft` (anonymous, expires) and `claimed` (bound to an
 * Account at the Login Gate, never expires; login-gate-claim). Later features add more states.
 */
export type KitchenProjectStatus = 'draft' | 'claimed';

/** Room measurements in whole centimetres; null while not entered. */
export interface KitchenMeasurements {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
}

/** One stored (normalized, metadata-free) kitchen photo. URLs are API-relative paths. */
export interface KitchenPhotoView {
  id: string;
  /** 0-based, compacted on delete. */
  position: number;
  /** Size of the stored `full` JPEG (orientation applied). */
  width: number;
  height: number;
  thumbUrl: string;
  fullUrl: string;
}

/** Server-side upload limits of a draft. */
export interface KitchenDraftLimits {
  maxPhotos: number;
  maxPhotoBytes: number;
  /** Moodboard Items per draft, uploads and gallery picks together (moodboard-selection). */
  maxMoodboardItems: number;
}

/** Body of `GET /kitchen-projects/drafts/current` and of the draft mutations. */
export interface KitchenDraftView {
  id: string;
  /** Draft routes only ever return drafts. */
  status: 'draft';
  measurements: KitchenMeasurements;
  photos: KitchenPhotoView[];
  /** Moodboard Items ordered by position (moodboard-selection). */
  moodboard: MoodboardItemView[];
  limits: KitchenDraftLimits;
  /** ISO timestamp; slides 7 days on every change. */
  expiresAt: string;
}

/** 201 body of `POST /kitchen-projects/drafts`. The token is shown exactly once. */
export interface StartKitchenDraftResponse {
  draft: KitchenDraftView;
  draftToken: string;
}

/** Machine-readable `code` of kitchen draft error bodies. */
export type KitchenDraftErrorCode =
  | 'draft_capacity'
  | 'invalid_measurements'
  | 'photo_missing'
  | 'photo_too_large'
  | 'photo_unsupported_type'
  | 'photo_too_small'
  | 'photo_limit_reached'
  | 'storage_unavailable'
  | 'moodboard_limit_reached'
  | 'gallery_image_unknown';

// --- Login Gate and claim (feature login-gate-claim) ---

/**
 * A claimed Kitchen Project as its owner sees it (`GET /kitchen-projects/:projectId`). Photo and
 * Moodboard upload URLs point at the owner content routes; gallery items keep the public
 * gallery URLs. URLs are API-relative paths.
 */
export interface KitchenProjectView {
  id: string;
  status: 'claimed';
  measurements: KitchenMeasurements;
  photos: KitchenPhotoView[];
  moodboard: MoodboardItemView[];
  /** ISO timestamp of the claim; unchanged by a repeated claim. */
  claimedAt: string;
}

/** 200 body of `POST /kitchen-projects/drafts/current/claim` (and of the web BFF route). */
export interface ClaimKitchenDraftResponse {
  project: KitchenProjectView;
}

/** Machine-readable `code` of owned Kitchen Project error bodies. */
export type KitchenProjectErrorCode =
  /** 409: not ready for generation (needs a photo, all three measurements and a Moodboard Item). */
  | 'project_incomplete'
  | 'storage_unavailable'
  /** 409: a Simulation of this project is queued or running (simulations-ux-overhaul). */
  | 'simulation_in_progress'
  /** 409: the Simulation is not finished with every Render succeeded (cannot be selected or priced). */
  | 'simulation_not_ready'
  /** 409: the project has no selected Simulation (Budget). */
  | 'no_simulation_selected'
  /** 409: Retry of a Render that did not fail. */
  | 'render_not_failed'
  /** 429: the GPU job queue is full; nothing was created. */
  | 'gpu_queue_full'
  /** 409: a Budget of this project is already queued or running (budget-tier-computation). */
  | 'budget_in_progress'
  /** 409: the Catalog RAG index has no chunk to price from. */
  | 'catalog_empty'
  /** 503: the embedder that searches the Catalog is unreachable. */
  | 'embedding_unavailable';

/** Per-field reason in a 400 `invalid_measurements` body. */
export type KitchenMeasurementFieldError = 'not_integer' | 'out_of_range';

// --- Moodboard and Style Gallery (feature moodboard-selection) ---

/** Where a Moodboard Item comes from: a Style Gallery image or an own reference photo. */
export type MoodboardItemSource = 'gallery' | 'upload';

/** One Moodboard Item of a draft. URLs are API-relative paths. */
export interface MoodboardItemView {
  id: string;
  source: MoodboardItemSource;
  /** Style Gallery image id; null for uploads. */
  galleryImageId: string | null;
  /** Style of the gallery image; null for uploads. */
  styleId: string | null;
  /** 0-based, compacted on delete. */
  position: number;
  /** Size of the `full` image. */
  width: number;
  height: number;
  thumbUrl: string;
  fullUrl: string;
}

/** Body of `POST /kitchen-projects/drafts/current/moodboard/gallery-items`. */
export interface AddGalleryItemRequest {
  galleryImageId: string;
}

/** One curated Style Gallery image. URLs are API-relative paths. */
export interface StyleGalleryImageView {
  id: string;
  width: number;
  height: number;
  thumbUrl: string;
  fullUrl: string;
}

/** One style of the Style Gallery with its images, in manifest order. */
export interface StyleGalleryStyleView {
  id: string;
  images: StyleGalleryImageView[];
}

/** Body of `GET /style-gallery`. */
export interface StyleGalleryView {
  styles: StyleGalleryStyleView[];
}

// --- Renders (feature controlnet-render) ---

/** Lifecycle of a Render: `queued -> running -> succeeded | failed`. */
export type RenderStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** ControlNet that keeps the room geometry. */
export type RenderMode = 'canny' | 'depth';

/** Public failure code of a Render. Backend messages are never exposed. */
export type RenderErrorCode = 'adapter_error' | 'timeout' | 'interrupted' | 'storage_unavailable';

/**
 * One Render of an owned Kitchen Project (`GET /kitchen-projects/:projectId/renders/:renderId`,
 * also nested in a {@link SimulationView}). `before` is the exact centre crop of the source Photo
 * given to the image model; `full` has the same size. URLs are API-relative paths;
 * `fullUrl`/`thumbUrl` are set only when `succeeded`. The seed, the prompt and the GPU job id stay internal.
 */
export interface RenderView {
  id: string;
  simulationId: string;
  status: RenderStatus;
  /** Source Photo; null if that Photo was deleted later. */
  photoId: string | null;
  /** 0-based position of the source Photo when the Simulation was created. */
  photoPosition: number;
  /** 1 for the first run, +1 per Retry. */
  attempts: number;
  mode: RenderMode;
  width: number;
  height: number;
  /** 1-based GPU queue position while `queued` (when known), otherwise null. */
  position: number | null;
  /** Kind of GPU work it waits behind while `queued`, otherwise null. */
  waitingFor: GpuJobKind | null;
  errorCode: RenderErrorCode | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  beforeUrl: string;
  fullUrl: string | null;
  thumbUrl: string | null;
}

// --- Simulations (feature simulations-ux-overhaul) ---

/** How the calculated style reaches the image model: IP-Adapter references, VLM text, or both. */
export type StyleBlendMode = 'ip_adapter' | 'vlm_text' | 'both';

/** Derived status: `active` while stage is not `finished`; then all succeeded, mixed, or none. */
export type SimulationStatus = 'active' | 'succeeded' | 'partial' | 'failed';

export type SimulationStage = 'describing' | 'rendering' | 'finished';

/** "n of N": `current` is the 1-based Render being generated (0 when none runs). */
export interface SimulationProgress {
  total: number;
  succeeded: number;
  failed: number;
  current: number;
}

/** One reference of the calculated style and its share of the blend. */
export interface SimulationStyleReference {
  kind: 'gallery' | 'upload';
  refId: string;
  weightPercent: number;
}

export interface SimulationStyleView {
  keywords: string[];
  references: SimulationStyleReference[];
}

/**
 * One Simulation of an owned Kitchen Project: one Render per Photo from one calculated style.
 * Selectable and budget-eligible only when `status` is `succeeded`. Seed, prompts, vision
 * descriptions, inventory and job ids stay internal.
 */
export interface SimulationView {
  id: string;
  ordinal: number;
  createdAt: string;
  status: SimulationStatus;
  stage: SimulationStage;
  progress: SimulationProgress;
  selected: boolean;
  blendMode: StyleBlendMode;
  /** The vision step failed (or the Simulation was migrated): the text style is the dominant style only. */
  styleDegraded: boolean;
  style: SimulationStyleView;
  /** In Photo order. */
  renders: RenderView[];
  /** The Budget of this Simulation (current succeeded, else the active one), if any. */
  budget: { id: string; status: BudgetStatus } | null;
}

/** 202 body of `POST /kitchen-projects/:projectId/simulations` and of a Render retry. */
export interface CreateSimulationResponse {
  simulation: SimulationView;
}

/** Body of `GET /kitchen-projects/:projectId/simulations`, newest first. */
export interface SimulationListResponse {
  simulations: SimulationView[];
}

/** Body of `PUT /kitchen-projects/:projectId/selected-simulation`. */
export interface SelectSimulationRequest {
  simulationId: string | null;
}

export interface SelectSimulationResponse {
  selectedSimulationId: string | null;
}

/** Body of `GET/PUT /admin/settings/style-blend`. */
export interface StyleBlendSettingView {
  mode: StyleBlendMode;
}

// --- Budgets (feature budget-tier-computation) ---

/** Lifecycle of a Budget: `queued -> running -> succeeded | failed`. */
export type BudgetStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** Where a running Budget is: reading the element inventory of the Simulation's images, then pricing. */
export type BudgetStage = 'inventory' | 'pricing';

/** The four Budget Tiers, in display order. */
export type BudgetTier = 'luxury' | 'high' | 'medium' | 'low';

/** Public failure code of a Budget. Backend messages are never exposed. */
export type BudgetErrorCode = 'adapter_error' | 'timeout' | 'interrupted' | 'verification_failed';

/**
 * One verified Line Item. Every amount is an integer in minor units (euro cents) computed by
 * code (ADR 0002); `quotedPrice` is the price exactly as the Catalog prints it and was verified
 * against the cited Catalog chunk. `quantity` is a decimal string with at most two decimals.
 */
export interface BudgetLineItemView {
  name: string;
  sku: string;
  /** Catalog the price comes from (PDF title or file name). */
  catalogName: string;
  /** 1-based page of that Catalog. */
  pageNumber: number;
  unit: string;
  quantity: string;
  quotedPrice: string;
  unitPriceCents: number;
  subtotalCents: number;
}

/**
 * One tier of a Budget. Catalog prices are VAT-inclusive: `totalCents` is the sum of the item
 * subtotals, `vatCents` its VAT part and `subtotalCents` the part before VAT (`subtotal + vat = total`).
 */
export interface BudgetTierView {
  tier: BudgetTier;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  items: BudgetLineItemView[];
}

/**
 * One Budget of an owned Kitchen Project. `tiers` is empty until `succeeded`. Prompt, token
 * counts, GPU job id and source quotes stay internal.
 */
export interface BudgetView {
  id: string;
  /** The Simulation this Budget prices. */
  simulationId: string;
  status: BudgetStatus;
  /** `inventory` (reading the images, "Reading image n of N") then `pricing`. */
  stage: BudgetStage;
  /** Images read so far (`done`) of the Simulation's images (`total`). */
  progress: { total: number; done: number };
  /** True when the tiers were named by total rank after the last attempt came out of order (names only, no amount changed). */
  relabeled: boolean;
  /** 1-based GPU queue position while `queued` (when known), otherwise null. */
  position: number | null;
  /** Kind of GPU work it waits behind while `queued`, otherwise null. */
  waitingFor: GpuJobKind | null;
  currency: 'EUR';
  /** VAT rate in percent (catalog prices are VAT-inclusive). */
  vatPercent: number;
  errorCode: BudgetErrorCode | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Number of verified Line Items over all tiers (0 until `succeeded`). */
  lineItemsCount: number;
  tiers: BudgetTierView[];
}

/** 202 body of `POST /kitchen-projects/:projectId/budget`. */
export interface CreateBudgetResponse {
  budget: BudgetView;
}

/** Body of `GET /kitchen-projects/:projectId/budgets`, newest first. */
export interface BudgetListResponse {
  /** Budgets of the selected Simulation, newest first: the current one plus an active or failed recompute (at most 2). */
  budgets: BudgetView[];
}
