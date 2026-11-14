import type { KitchenPhotoView } from './types';

/** File picker filter (HEIC/HEIF by MIME type and extension: some browsers report no type). */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS = 8;
export const UPLOAD_URL = '/api/kitchen-projects/drafts/current/photos';
/** Own reference photos of the Moodboard (same photo rules and multipart field). */
export const MOODBOARD_UPLOAD_URL = '/api/kitchen-projects/drafts/current/moodboard/uploads';

export type UploadErrorCode =
  | 'photo_too_large'
  | 'photo_unsupported_type'
  | 'photo_too_small'
  | 'photo_limit_reached'
  | 'moodboard_limit_reached'
  | 'storage_unavailable'
  /** 404: the draft is gone (expired or never created); the caller starts one and retries. */
  | 'draft_missing'
  /** 409 `simulation_in_progress` / `budget_in_progress` on an owner edit route (edit pages only). */
  | 'edit_blocked'
  /** Network error or proxy 502: offline or the API is unreachable. */
  | 'network'
  | 'failed';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** Client pre-check before any upload: size on every file, type by MIME type (or HEIC/HEIF extension). */
export function precheckPhoto(file: { size: number; type: string; name: string }, maxBytes = MAX_PHOTO_BYTES): UploadErrorCode | null {
  if (file.size > maxBytes) return 'photo_too_large';
  const type = file.type.toLowerCase();
  if (ACCEPTED_TYPES.has(type)) return null;
  if ((type === '' || type === 'application/octet-stream') && /\.(heic|heif)$/i.test(file.name)) return null;
  return 'photo_unsupported_type';
}

export function errorCodeForStatus(status: number, code?: unknown): UploadErrorCode {
  const known: UploadErrorCode[] = [
    'photo_too_large',
    'photo_unsupported_type',
    'photo_too_small',
    'photo_limit_reached',
    'moodboard_limit_reached',
    'storage_unavailable',
  ];
  if (code === 'simulation_in_progress' || code === 'budget_in_progress') return 'edit_blocked';
  if (typeof code === 'string' && (known as string[]).includes(code)) return code as UploadErrorCode;
  switch (status) {
    case 0:
    case 502:
      return 'network';
    case 404:
      return 'draft_missing';
    case 409:
      return 'photo_limit_reached';
    case 413:
      return 'photo_too_large';
    case 415:
      return 'photo_unsupported_type';
    case 422:
      return 'photo_too_small';
    case 503:
      return 'storage_unavailable';
    default:
      return 'failed';
  }
}

/** Errors where Retry can help (the design shows Retry + Remove for these, Remove only otherwise). */
export function isRetryable(code: UploadErrorCode): boolean {
  return code === 'failed' || code === 'storage_unavailable' || code === 'network' || code === 'draft_missing';
}

/** `photo` is the 201 body: a KitchenPhotoView for Capture, a MoodboardItemView for the Moodboard. */
export type UploadResult<T = KitchenPhotoView> = { ok: true; photo: T } | { ok: false; code: UploadErrorCode };

export interface UploadOptions {
  /** 0-100 while the bytes are sent. */
  onProgress?: (percent: number) => void;
  /** All bytes sent; the server is now converting the photo. */
  onUploaded?: () => void;
  signal?: AbortSignal;
  createXhr?: () => XMLHttpRequest;
  /** Target route: Capture photos by default, MOODBOARD_UPLOAD_URL for references. */
  url?: string;
}

/** Multipart upload (field `photo`) with XHR, for upload progress. Never rejects. */
export function uploadPhoto<T = KitchenPhotoView>(
  file: Blob,
  { onProgress, onUploaded, signal, createXhr = () => new XMLHttpRequest(), url = UPLOAD_URL }: UploadOptions = {},
): Promise<UploadResult<T>> {
  return new Promise((resolve) => {
    const xhr = createXhr();
    const body = new FormData();
    body.append('photo', file);
    xhr.open('POST', url);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.upload.onload = () => {
      onProgress?.(100);
      onUploaded?.();
    };
    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        parsed = null;
      }
      if (xhr.status === 201 && parsed && typeof parsed === 'object') {
        resolve({ ok: true, photo: parsed as T });
        return;
      }
      const code = parsed && typeof parsed === 'object' ? (parsed as { code?: unknown }).code : undefined;
      resolve({ ok: false, code: errorCodeForStatus(xhr.status, code) });
    };
    xhr.onerror = () => resolve({ ok: false, code: 'network' });
    xhr.onabort = () => resolve({ ok: false, code: 'failed' });
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
