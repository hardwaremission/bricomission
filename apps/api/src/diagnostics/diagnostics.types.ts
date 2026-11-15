import type { DiagnosticsDraft } from './event.js';

/** Provider token of the {@link Diagnostics} facade (a real service when enabled, `NullDiagnostics` otherwise). */
export const DIAGNOSTICS = Symbol('DIAGNOSTICS');
/** Provider token of the resolved {@link DiagnosticsOptions} (present only when enabled). */
export const DIAGNOSTICS_OPTIONS = Symbol('DIAGNOSTICS_OPTIONS');

/** Handle of an open span; `end` emits the paired `end` event with the elapsed time. */
export interface DiagnosticsSpanHandle {
  readonly id: string;
  end(result?: Partial<Pick<DiagnosticsDraft, 'summary' | 'payload' | 'ok' | 'durationMs'>>): void;
}

/** What instrumented code depends on. Emitting never throws and never blocks. */
export interface Diagnostics {
  readonly enabled: boolean;
  emit(draft: DiagnosticsDraft): void;
  /** Emits the `start` event now; the returned handle emits the `end` event. */
  span(draft: DiagnosticsDraft): DiagnosticsSpanHandle;
}

export interface DiagnosticsOptions {
  token: string;
  adapters: 'fake' | 'local';
  bufferSize: number;
  bufferMaxBytes: number;
  heartbeatMs: number;
  /** Environment used to read model names for the topology. */
  env: NodeJS.ProcessEnv;
  /** Injectable for tests. */
  now: () => number;
  /** Ingest rate limit (events per second). */
  ingestPerSecond: number;
}

export const MIN_TOKEN_LENGTH = 16;
