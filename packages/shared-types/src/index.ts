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
  /** 501: the costly action is not implemented yet (controlnet-render, budget-tier-computation). */
  | 'not_available_yet'
  | 'storage_unavailable';

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
