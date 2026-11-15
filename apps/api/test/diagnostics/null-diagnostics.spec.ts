import { describe, expect, it, vi } from 'vitest';
import type { Diagnostics } from '../../src/diagnostics/diagnostics.types.js';
import { NullDiagnostics } from '../../src/diagnostics/null-diagnostics.js';

describe('NullDiagnostics', () => {
  it('is disabled, allocates no span and ignores everything', () => {
    const diagnostics: Diagnostics = new NullDiagnostics();
    expect(diagnostics.enabled).toBe(false);
    const draft = { from: 'web', to: 'api-guards', kind: 'http', summary: 's' } as const;
    const a = diagnostics.span(draft);
    const b = diagnostics.span(draft);
    expect(a).toBe(b); // one shared frozen handle: nothing allocated per call
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => a.end({ ok: false })).not.toThrow();
    expect(diagnostics.emit(draft)).toBeUndefined();
  });

  it('can be spied on: a disabled run observes zero emits through the facade', () => {
    const diagnostics: Diagnostics = new NullDiagnostics();
    const emit = vi.spyOn(diagnostics, 'emit');
    if (diagnostics.enabled) diagnostics.emit({ from: 'web', to: 'web', kind: 'step', summary: 'x' });
    expect(emit).not.toHaveBeenCalled();
  });
});
