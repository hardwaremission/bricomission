import type { DiagnosticsEvent } from '@bricomission/shared-types';

let seq = 0;

export function resetSeq(start = 0): void {
  seq = start;
}

/** Builds an event with the next sequence; `ts` advances 10 ms per event unless given. */
export function ev(partial: Partial<DiagnosticsEvent> & Pick<DiagnosticsEvent, 'from' | 'to' | 'kind'>): DiagnosticsEvent {
  seq += 1;
  return { id: String(seq), ts: 1_700_000_000_000 + seq * 10, correlationId: 'aaaaaaaaaaaaaaaa', summary: `${partial.from} to ${partial.to}`, payload: {}, ...partial };
}
