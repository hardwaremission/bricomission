/**
 * Pure redaction of diagnostics payloads. Everything that leaves the API through the diagnostics
 * stream goes through {@link redact} first (including events ingested from the web BFF).
 *
 * Never passes: tokens, cookies, secrets, passwords, authorization headers, session ids, `styleSeed`,
 * OTP codes, image bytes, `data:` URIs (except the thumbnails made by {@link asThumbnail}).
 * Always passes verbatim: prompts and style texts (up to {@link MAX_TEXT_BYTES}).
 */

export const MAX_TEXT_BYTES = 64 * 1024;
export const MAX_ARRAY_ITEMS = 50;
export const MAX_OBJECT_KEYS = 100;
export const MAX_DEPTH = 6;
/** Thumbnails: at most this many pixels on the longer side and this many encoded bytes. */
export const MAX_THUMB_PX = 96;
export const MAX_THUMB_BYTES = 6 * 1024;

export const REDACTED = '[redacted]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'password',
  'passwd',
  'pwd',
  'secret',
  'clientsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearer',
  'apikey',
  'xapikey',
  'drafttoken',
  'xdrafttoken',
  'diagnosticstoken',
  'xdiagnosticstoken',
  'bmsession',
  'bmdraft',
  'session',
  'sessionid',
  'sessionkey',
  'sessionstate',
  'sessioncookie',
  'otp',
  'otpcode',
  'code',
  'styleseed',
  'seed',
  'accesskey',
  'accesskeyid',
  'secretkey',
  'secretaccesskey',
  's3accesskey',
  's3secretkey',
  'privatekey',
  'credential',
  'credentials',
]);
const SENSITIVE_SUFFIXES = ['password', 'secret', 'token', 'cookie', 'apikey', 'authorization', 'secretkey', 'accesskey'];

/** True when a key name must never carry its value out (`hasDraftToken: true` is fine: booleans pass). */
export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_\s.]/g, '');
  return SENSITIVE_KEYS.has(k) || SENSITIVE_SUFFIXES.some((suffix) => k.endsWith(suffix));
}

const thumbnails = new WeakSet<object>();

export interface Thumbnail {
  kind: 'thumbnail';
  /** `data:image/jpeg;base64,...` of at most {@link MAX_THUMB_PX} px and {@link MAX_THUMB_BYTES} bytes. */
  dataUri: string;
  width: number;
  height: number;
  bytes: number;
  /** Size of the image the thumbnail stands for. */
  originalBytes?: number;
}

/**
 * The only way a `data:` URI passes {@link redact} (called by `thumbnail.ts`). Throws when the
 * thumbnail is not a small JPEG, so a full image can never be smuggled through by mistake.
 */
export function asThumbnail(dataUri: string, width: number, height: number, originalBytes?: number): Thumbnail {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri);
  if (!match) throw new Error('thumbnail must be a base64 JPEG data URI');
  const bytes = Math.floor((match[1].length * 3) / 4);
  if (bytes > MAX_THUMB_BYTES) throw new Error(`thumbnail larger than ${MAX_THUMB_BYTES} bytes`);
  if (!(width > 0 && height > 0 && width <= MAX_THUMB_PX && height <= MAX_THUMB_PX)) {
    throw new Error(`thumbnail larger than ${MAX_THUMB_PX} px`);
  }
  const value: Thumbnail = { kind: 'thumbnail', dataUri, width, height, bytes };
  if (originalBytes !== undefined) value.originalBytes = originalBytes;
  thumbnails.add(value);
  return Object.freeze(value);
}

export interface RedactOptions {
  maxTextBytes?: number;
}

/** Redacts `value` into a JSON-safe structure. Never throws. */
export function redact(value: unknown, options: RedactOptions = {}): unknown {
  return walk(value, 0, options.maxTextBytes ?? MAX_TEXT_BYTES);
}

/** Same as {@link redact} for a payload that must be an object (anything else becomes `{ value }`). */
export function redactPayload(value: unknown, options: RedactOptions = {}): Record<string, unknown> {
  const out = redact(value, options);
  if (out !== null && typeof out === 'object' && !Array.isArray(out)) return out as Record<string, unknown>;
  return out === undefined || out === null ? {} : { value: out };
}

function walk(value: unknown, depth: number, maxText: number): unknown {
  if (value === null || value === undefined) return value === null ? null : undefined;
  switch (typeof value) {
    case 'string':
      return redactString(value, maxText);
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return undefined;
    default:
      break;
  }
  const obj = value as object;
  if (thumbnails.has(obj)) return { ...(obj as Thumbnail) };
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) return { binary: true, bytes: obj.byteLength };
  if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)) return { binary: true, bytes: obj.byteLength };
  if (obj instanceof Error) return redactError(obj, depth, maxText);
  if (depth >= MAX_DEPTH) return { truncated: true, reason: 'depth' };
  if (Array.isArray(obj)) return redactArray(obj, depth, maxText);
  if (obj instanceof Set) return redactArray([...obj], depth, maxText);
  if (obj instanceof Map) return redactEntries([...obj.entries()].map(([k, v]) => [String(k), v]), depth, maxText);
  return redactEntries(Object.entries(obj), depth, maxText);
}

function redactArray(items: unknown[], depth: number, maxText: number): unknown[] {
  const out: unknown[] = [];
  for (const item of items.slice(0, MAX_ARRAY_ITEMS)) {
    const next = walk(item, depth + 1, maxText);
    out.push(next === undefined ? null : next);
  }
  if (items.length > MAX_ARRAY_ITEMS) out.push({ truncated: true, omittedItems: items.length - MAX_ARRAY_ITEMS });
  return out;
}

function redactEntries(entries: Array<[string, unknown]>, depth: number, maxText: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, raw] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (kept >= MAX_OBJECT_KEYS) {
      out.truncatedKeys = entries.length - MAX_OBJECT_KEYS;
      break;
    }
    kept += 1;
    if (isSensitiveKey(key) && typeof raw !== 'boolean' && raw !== null && raw !== undefined) {
      out[key] = REDACTED;
      continue;
    }
    const next = walk(raw, depth + 1, maxText);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function redactError(error: Error, depth: number, maxText: number): Record<string, unknown> {
  const out: Record<string, unknown> = { name: error.name, message: redactString(error.message, maxText) };
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && depth < MAX_DEPTH) out.cause = walk(cause, depth + 1, maxText);
  return out;
}

/** JSON-in-text and header-like `name: value` / `name=value` pairs whose value must go. */
const SECRET_PAIR =
  /(?<![A-Za-z0-9])([\w-]*(?:password|passwd|secret|token|api_?key|access_?key|secret_?key|private_?key|authorization|cookie)|bm_session|bm_draft|session_?id)(["']?\s*[:=]\s*["']?)(?:Bearer\s+|Basic\s+)?[^"'\s,;&}]+/gi;
/** OIDC/OTP parameters in URLs and form bodies (`?code=...&state=...`). */
const QUERY_SECRET = /([?&](?:code|state|session_state|token|otp)=)[^&\s"']+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]{8,}=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const DATA_URI = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
const EMAIL = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const BASE64_BLOB = /^[A-Za-z0-9+/\-_]{2000,}={0,2}$/;

function redactString(input: string, maxText: number): unknown {
  if (BASE64_BLOB.test(input)) return `[redacted:base64 ${input.length} chars]`;
  const text = input
    .replace(DATA_URI, (m) => `[redacted:data-uri ${m.length} chars]`)
    .replace(JWT, '[redacted:jwt]')
    .replace(SECRET_PAIR, (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`)
    .replace(QUERY_SECRET, `$1${REDACTED}`)
    .replace(BEARER, '$1 [redacted]')
    .replace(EMAIL, '$1***@$2');
  return truncateText(text, maxText);
}

/** Text over the limit becomes `{ text, truncated, originalBytes, expandable }`; the text keeps the first `maxText` bytes. */
export function truncateText(text: string, maxText: number = MAX_TEXT_BYTES): unknown {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= maxText) return text;
  const head = Buffer.from(text, 'utf8').subarray(0, maxText).toString('utf8').replace(/�+$/u, '');
  return { text: head, truncated: true, originalBytes: bytes, expandable: true };
}
