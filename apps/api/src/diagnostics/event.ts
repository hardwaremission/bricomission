import type {
  DiagnosticsEvent,
  DiagnosticsIngestEvent,
  DiagnosticsKind,
  DiagnosticsNodeId,
  DiagnosticsSpan,
} from '@bricomission/shared-types';
import { isValidCorrelationId, SYSTEM_CORRELATION_ID } from './correlation.js';
import { redact, redactPayload, truncateText } from './redact.js';

export const DIAGNOSTICS_KINDS: readonly DiagnosticsKind[] = [
  'http',
  'auth',
  'guard',
  'sql',
  'object',
  'llm',
  'image',
  'embed',
  'queue',
  'residency',
  'step',
  'compute',
  'mail',
  'session',
];

export const DIAGNOSTICS_NODE_IDS: readonly DiagnosticsNodeId[] = [
  'browser',
  'web',
  'api-guards',
  'project-service',
  'style-gallery',
  'simulation-runner',
  'budget-engine',
  'image-pipeline',
  'style-engine',
  'gpu-broker',
  'budget-math',
  'catalog-search',
  'residency-hook',
  'ai-adapters',
  'storage-client',
  'data-access',
  'keycloak',
  'mailpit',
  'llama-server',
  'comfyui',
  'embedder',
  'minio',
  'postgres',
];

const KINDS = new Set<string>(DIAGNOSTICS_KINDS);
const NODE_IDS = new Set<string>(DIAGNOSTICS_NODE_IDS);

export const MAX_SUMMARY_CHARS = 300;
/** Whole payload (after redaction) in bytes. */
export const MAX_PAYLOAD_BYTES = 96 * 1024;
const SHRUNK_TEXT_BYTES = 8 * 1024;
const MAX_SPAN_ID_CHARS = 64;
const MAX_DURATION_MS = 24 * 3_600_000;

/** What callers hand to `emit`: the server fills `id`, `ts` and (when missing) the correlation id. */
export interface DiagnosticsDraft {
  correlationId?: string;
  from: DiagnosticsNodeId;
  to: DiagnosticsNodeId;
  kind: DiagnosticsKind;
  summary: string;
  payload?: unknown;
  span?: DiagnosticsSpan;
  durationMs?: number;
  ok?: boolean;
  simulated?: boolean;
  inferred?: boolean;
  poll?: boolean;
  /** Event time (epoch ms); defaults to now. */
  ts?: number;
}

export function isNodeId(value: unknown): value is DiagnosticsNodeId {
  return typeof value === 'string' && NODE_IDS.has(value);
}

export function isKind(value: unknown): value is DiagnosticsKind {
  return typeof value === 'string' && KINDS.has(value);
}

/** UTF-8 size of the JSON form of `value`. */
export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * Builds the stored event: redacts summary and payload, caps sizes, drops undefined flags.
 * A payload over {@link MAX_PAYLOAD_BYTES} is first shrunk (every text cut to 8 KB), then replaced by
 * a marker with its top-level keys.
 */
export function buildEvent(draft: DiagnosticsDraft, seq: number, now: number, fallbackCorrelationId: string = SYSTEM_CORRELATION_ID): DiagnosticsEvent {
  const summaryRaw = redact(draft.summary);
  const summaryText = typeof summaryRaw === 'string' ? summaryRaw : JSON.stringify(summaryRaw);
  const summary = summaryText.length > MAX_SUMMARY_CHARS ? `${summaryText.slice(0, MAX_SUMMARY_CHARS - 1)}…` : summaryText;
  const event: DiagnosticsEvent = {
    id: String(seq),
    ts: Number.isFinite(draft.ts) ? (draft.ts as number) : now,
    correlationId: draft.correlationId && (draft.correlationId === SYSTEM_CORRELATION_ID || isValidCorrelationId(draft.correlationId)) ? draft.correlationId : fallbackCorrelationId,
    from: draft.from,
    to: draft.to,
    kind: draft.kind,
    summary,
    payload: capPayload(redactPayload(draft.payload)),
  };
  if (draft.span) event.span = { id: String(draft.span.id).slice(0, MAX_SPAN_ID_CHARS), phase: draft.span.phase };
  if (draft.durationMs !== undefined && Number.isFinite(draft.durationMs)) event.durationMs = Math.max(0, Math.round(draft.durationMs));
  if (draft.ok !== undefined) event.ok = draft.ok;
  if (draft.simulated) event.simulated = true;
  if (draft.inferred) event.inferred = true;
  if (draft.poll) event.poll = true;
  return event;
}

function capPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const size = jsonBytes(payload);
  if (size <= MAX_PAYLOAD_BYTES) return payload;
  const shrunk = shrinkTexts(payload, SHRUNK_TEXT_BYTES) as Record<string, unknown>;
  if (jsonBytes(shrunk) <= MAX_PAYLOAD_BYTES) return shrunk;
  return { truncated: true, originalBytes: size, keys: Object.keys(payload).slice(0, 50) };
}

function shrinkTexts(value: unknown, max: number): unknown {
  if (typeof value === 'string') return truncateText(value, max);
  if (Array.isArray(value)) return value.map((item) => shrinkTexts(item, max));
  if (value !== null && typeof value === 'object') {
    const marker = value as { truncated?: unknown; text?: unknown };
    if (marker.truncated === true && typeof marker.text === 'string') {
      const cut = truncateText(marker.text, max);
      return { ...(value as object), text: typeof cut === 'string' ? cut : (cut as { text: string }).text };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shrinkTexts(v, max)]));
  }
  return value;
}

export type IngestValidation = { ok: true; draft: DiagnosticsDraft } | { ok: false; error: string };

const MAX_AGE_MS = 10 * 60_000;
const MAX_FUTURE_MS = 5_000;

/** Validates one event sent to `POST /diagnostics/ingest`. Unknown extra fields are ignored. */
export function validateIngestEvent(raw: unknown, now: number): IngestValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'event must be an object' };
  const e = raw as Partial<Record<keyof DiagnosticsIngestEvent, unknown>>;
  if (!isNodeId(e.from) || !isNodeId(e.to)) return { ok: false, error: 'unknown node id' };
  if (!isKind(e.kind)) return { ok: false, error: 'unknown kind' };
  if (typeof e.summary !== 'string' || e.summary.length === 0 || e.summary.length > MAX_SUMMARY_CHARS * 4) return { ok: false, error: 'invalid summary' };
  if (typeof e.correlationId !== 'string' || !(e.correlationId === SYSTEM_CORRELATION_ID || isValidCorrelationId(e.correlationId))) return { ok: false, error: 'invalid correlationId' };
  if (e.payload !== undefined && (e.payload === null || typeof e.payload !== 'object' || Array.isArray(e.payload))) return { ok: false, error: 'payload must be an object' };
  for (const flag of ['ok', 'simulated', 'inferred', 'poll'] as const) {
    if (e[flag] !== undefined && typeof e[flag] !== 'boolean') return { ok: false, error: `${flag} must be a boolean` };
  }
  if (e.durationMs !== undefined && !(typeof e.durationMs === 'number' && Number.isFinite(e.durationMs) && e.durationMs >= 0 && e.durationMs <= MAX_DURATION_MS)) {
    return { ok: false, error: 'invalid durationMs' };
  }
  let span: DiagnosticsSpan | undefined;
  if (e.span !== undefined) {
    const s = e.span as Partial<DiagnosticsSpan> | null;
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || s.id.length === 0 || s.id.length > MAX_SPAN_ID_CHARS || (s.phase !== 'start' && s.phase !== 'end')) {
      return { ok: false, error: 'invalid span' };
    }
    span = { id: s.id, phase: s.phase };
  }
  let ts: number | undefined;
  if (typeof e.ts === 'number' && Number.isFinite(e.ts) && e.ts >= now - MAX_AGE_MS && e.ts <= now + MAX_FUTURE_MS) ts = e.ts;
  const draft: DiagnosticsDraft = {
    correlationId: e.correlationId,
    from: e.from,
    to: e.to,
    kind: e.kind,
    summary: e.summary,
    payload: e.payload,
    span,
    durationMs: e.durationMs as number | undefined,
    ok: e.ok as boolean | undefined,
    simulated: e.simulated as boolean | undefined,
    inferred: e.inferred as boolean | undefined,
    poll: e.poll as boolean | undefined,
    ts,
  };
  return { ok: true, draft };
}
