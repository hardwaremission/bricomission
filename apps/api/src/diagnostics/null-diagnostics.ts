import type { Diagnostics, DiagnosticsSpanHandle } from './diagnostics.types.js';

const NOOP_SPAN: DiagnosticsSpanHandle = Object.freeze({ id: '', end: () => undefined });

/** Installed when diagnostics are off: allocates nothing per call. */
export class NullDiagnostics implements Diagnostics {
  readonly enabled = false;

  emit(): void {
    // no-op
  }

  span(): DiagnosticsSpanHandle {
    return NOOP_SPAN;
  }
}

/** Shared instance for constructors where the dependency is optional (tests, scripts). */
export const NULL_DIAGNOSTICS: Diagnostics = new NullDiagnostics();
