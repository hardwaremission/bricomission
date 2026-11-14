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
  /** 501: the costly action is not implemented yet (budget-tier-computation). */
  | 'not_available_yet'
  | 'storage_unavailable'
  /** 400: `photoId` is malformed or not a Photo of this project (controlnet-render). */
  | 'render_photo_unknown'
  /** 409: a Render of this project is already queued or running. */
  | 'render_in_progress'
  /** 409: the project already has `RENDER_MAX_PER_PROJECT` non-failed Renders. */
  | 'render_limit_reached'
  /** 429: the GPU job queue is full; no Render was created. */
  | 'gpu_queue_full';

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
 * One Render of an owned Kitchen Project (`GET /kitchen-projects/:projectId/renders/:renderId`).
 * `before` is the exact centre crop of the source Photo given to the image model; `full` has the
 * same size. URLs are API-relative paths; `fullUrl`/`thumbUrl` are set only when `succeeded`.
 * The seed, the prompt and the GPU job id stay internal.
 */
export interface RenderView {
  id: string;
  status: RenderStatus;
  /** Source Photo; null if that Photo was deleted later. */
  photoId: string | null;
  /** Dominant Moodboard style used for the prompt; null when the Moodboard has only uploads. */
  styleId: string | null;
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

/** Body of `POST /kitchen-projects/:projectId/renders` (all fields optional). */
export interface CreateRenderRequest {
  /** Photo to render; default: the Photo at position 0. */
  photoId?: string;
}

/** 202 body of `POST /kitchen-projects/:projectId/renders`. */
export interface CreateRenderResponse {
  render: RenderView;
}

/** Body of `GET /kitchen-projects/:projectId/renders`, newest first. */
export interface RenderListResponse {
  renders: RenderView[];
  /** Non-failed Renders allowed per project (`RENDER_MAX_PER_PROJECT`). */
  maxRenders: number;
}
