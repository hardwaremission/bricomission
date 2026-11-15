import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DiagnosticsEvent, DiagnosticsHello } from '@bricomission/shared-types';
import { currentCorrelation, currentCorrelationId } from './correlation.js';
import { DIAGNOSTICS_OPTIONS, type Diagnostics, type DiagnosticsOptions, type DiagnosticsSpanHandle } from './diagnostics.types.js';
import { buildEvent, type DiagnosticsDraft, jsonBytes } from './event.js';
import { RingBuffer, type RingEntry } from './ring-buffer.js';

export type DiagnosticsSubscriber = (entry: RingEntry<DiagnosticsEvent>) => void;

/** The real diagnostics bus: builds, redacts and buffers events and fans them out to stream subscribers. */
@Injectable()
export class DiagnosticsService implements Diagnostics {
  readonly enabled = true;
  readonly bootId = randomBytes(6).toString('hex');
  private readonly logger = new Logger(DiagnosticsService.name);
  private readonly buffer: RingBuffer<DiagnosticsEvent>;
  private readonly subscribers = new Set<DiagnosticsSubscriber>();
  private spanCounter = 0;
  private ingestWindowStart = 0;
  private ingestWindowCount = 0;
  private droppedWarned = false;

  constructor(@Inject(DIAGNOSTICS_OPTIONS) private readonly options: DiagnosticsOptions) {
    this.buffer = new RingBuffer<DiagnosticsEvent>({ maxCount: options.bufferSize, maxBytes: options.bufferMaxBytes });
  }

  emit(draft: DiagnosticsDraft): void {
    try {
      const poll = draft.poll === undefined && currentCorrelation()?.poll === true;
      this.publish(poll ? { ...draft, poll: true } : draft, currentCorrelationId());
    } catch (error) {
      if (!this.droppedWarned) {
        this.droppedWarned = true;
        this.logger.warn(`Diagnostics event dropped (${error instanceof Error ? error.name : 'unknown'})`);
      }
    }
  }

  span(draft: DiagnosticsDraft): DiagnosticsSpanHandle {
    const id = `${this.bootId}-${(this.spanCounter += 1).toString(36)}`;
    const startedAt = this.options.now();
    const correlationId = draft.correlationId ?? currentCorrelationId();
    this.emit({ ...draft, correlationId, span: { id, phase: 'start' } });
    let ended = false;
    return {
      id,
      end: (result = {}) => {
        if (ended) return;
        ended = true;
        this.emit({
          ...draft,
          ...result,
          correlationId,
          span: { id, phase: 'end' },
          durationMs: result.durationMs ?? this.options.now() - startedAt,
        });
      },
    };
  }

  /** Stores an already validated event (web ingest) under its own correlation id. */
  ingest(draft: DiagnosticsDraft): void {
    this.publish(draft, draft.correlationId ?? currentCorrelationId());
  }

  /** False once more than `ingestPerSecond` events were accepted in the current second. */
  allowIngest(count: number): boolean {
    const now = this.options.now();
    if (now - this.ingestWindowStart >= 1000) {
      this.ingestWindowStart = now;
      this.ingestWindowCount = 0;
    }
    if (this.ingestWindowCount + count > this.options.ingestPerSecond) return false;
    this.ingestWindowCount += count;
    return true;
  }

  hello(): DiagnosticsHello {
    return {
      bootId: this.bootId,
      enabled: true,
      adapters: this.options.adapters,
      oldestSeq: this.buffer.oldestSeq,
      newestSeq: this.buffer.newestSeq,
      bufferCount: this.buffer.count,
    };
  }

  /** Entries to replay: `seq > afterSeq`, or the last `replay` entries when no resume id is given. */
  replay(afterSeq: number, lastN?: number): RingEntry<DiagnosticsEvent>[] {
    if (afterSeq > 0 || lastN === undefined) return this.buffer.since(afterSeq);
    return this.buffer.last(lastN);
  }

  subscribe(subscriber: DiagnosticsSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private publish(draft: DiagnosticsDraft, fallbackCorrelationId: string): void {
    const now = this.options.now();
    const entry = this.buffer.append((seq) => {
      const value = buildEvent(draft, seq, now, fallbackCorrelationId);
      return { value, bytes: jsonBytes(value) };
    });
    for (const subscriber of this.subscribers) {
      try {
        subscriber(entry);
      } catch {
        // A broken subscriber must not stop the others or the caller.
      }
    }
  }
}
