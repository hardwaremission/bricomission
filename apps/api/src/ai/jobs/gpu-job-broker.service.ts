import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type {
  GpuJobErrorCode,
  GpuJobEvent,
  GpuJobKind,
  GpuJobStatus,
  GpuJobView,
} from '@bricomission/shared-types';
import { Observable, Subject } from 'rxjs';
import { GPU_BROKER_OPTIONS } from '../ai.tokens.js';
import { GpuJobFailedError, GpuQueueFullError } from './gpu-job-broker.errors.js';
import type { GpuBrokerOptions } from './gpu-broker.options.js';
import { GpuResidencyHook } from './gpu-residency.hook.js';

/** Context handed to a job's run function. */
export interface GpuJobContext {
  /** Fires when the job times out; adapters must pass it to their I/O. */
  signal: AbortSignal;
}

export type GpuJobRun<T> = (ctx: GpuJobContext) => Promise<T>;

export interface GpuJobSubmitOptions {
  /** Opaque owner reference for future ownership checks. Not exposed in views. */
  ownerRef?: string;
}

export interface GpuJobHandle<T> {
  jobId: string;
  /** Resolves with the run's value, or rejects with `GpuJobFailedError`. */
  result: Promise<T>;
}

/** Contract product features depend on; a durable backend can replace the in-memory one. */
export interface GpuJobBroker {
  submit<T>(kind: GpuJobKind, run: GpuJobRun<T>, opts?: GpuJobSubmitOptions): GpuJobHandle<T>;
  get(jobId: string): GpuJobView | undefined;
  events(jobId: string, afterSeq?: number): Observable<GpuJobEvent> | undefined;
}

interface JobRecord {
  id: string;
  kind: GpuJobKind;
  ownerRef: string | undefined;
  status: GpuJobStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: GpuJobErrorCode | null;
  position: number | null;
  waitingFor: GpuJobKind | null;
  history: GpuJobEvent[];
  subject: Subject<GpuJobEvent>;
  run: GpuJobRun<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: GpuJobFailedError) => void;
  abort: AbortController | null;
  timer: NodeJS.Timeout | null;
}

/**
 * In-process GPU job broker (single API instance, single GPU).
 *
 * One FIFO queue, head-of-line admission: an `image` head starts only when nothing
 * runs; an `llm` head starts when no image runs and fewer than `llmConcurrency`
 * LLM jobs run. No look-ahead, so a queued image is never starved by later chat.
 * Jobs live in memory: they are lost on restart.
 */
@Injectable()
export class GpuJobBrokerService implements GpuJobBroker, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpuJobBrokerService.name);
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: JobRecord[] = [];
  private runningImage = false;
  private runningLlm = 0;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(GPU_BROKER_OPTIONS) private readonly options: GpuBrokerOptions,
    private readonly residency: GpuResidencyHook,
  ) {}

  onModuleInit(): void {
    const every = Math.min(this.options.retentionMs, 60_000);
    this.pruneTimer = setInterval(() => this.prune(), every);
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    for (const job of this.jobs.values()) {
      if (job.timer) clearTimeout(job.timer);
      job.timer = null;
    }
  }

  submit<T>(kind: GpuJobKind, run: GpuJobRun<T>, opts: GpuJobSubmitOptions = {}): GpuJobHandle<T> {
    this.prune();
    if (this.queue.length >= this.options.maxQueued) {
      throw new GpuQueueFullError(this.options.maxQueued);
    }
    let resolve!: (value: unknown) => void;
    let reject!: (error: GpuJobFailedError) => void;
    const result = new Promise<T>((res, rej) => {
      resolve = res as (value: unknown) => void;
      reject = rej;
    });
    // Callers that never await the result must not crash the process.
    result.catch(() => undefined);

    const job: JobRecord = {
      id: this.options.newId(),
      kind,
      ownerRef: opts.ownerRef,
      status: 'queued',
      createdAt: this.options.now(),
      startedAt: null,
      finishedAt: null,
      errorCode: null,
      position: null,
      waitingFor: null,
      history: [],
      subject: new Subject<GpuJobEvent>(),
      run: run as GpuJobRun<unknown>,
      resolve,
      reject,
      abort: null,
      timer: null,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.refreshQueued();
    this.pump();
    return { jobId: job.id, result };
  }

  get(jobId: string): GpuJobView | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      position: job.status === 'queued' ? job.position : null,
      waitingFor: job.status === 'queued' ? job.waitingFor : null,
      createdAt: iso(job.createdAt),
      startedAt: job.startedAt === null ? null : iso(job.startedAt),
      finishedAt: job.finishedAt === null ? null : iso(job.finishedAt),
      errorCode: job.errorCode,
    };
  }

  /** Replays events with `seq > afterSeq`, then live ones; completes after the terminal event. */
  events(jobId: string, afterSeq = 0): Observable<GpuJobEvent> | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    return new Observable<GpuJobEvent>((subscriber) => {
      for (const event of job.history) {
        if (event.seq > afterSeq) subscriber.next(event);
      }
      if (isTerminal(job.status)) {
        subscriber.complete();
        return undefined;
      }
      return job.subject.subscribe(subscriber);
    });
  }

  /** Removes finished jobs older than `retentionMs`. */
  prune(): void {
    const cutoff = this.options.now() - this.options.retentionMs;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== null && job.finishedAt <= cutoff) this.jobs.delete(id);
    }
  }

  private canStart(job: JobRecord): boolean {
    if (this.runningImage) return false;
    if (job.kind === 'image') return this.runningLlm === 0;
    return this.runningLlm < this.options.llmConcurrency;
  }

  /** Starts queue heads while they fit; never looks past a head that cannot start. */
  private pump(): void {
    while (this.queue.length > 0 && this.canStart(this.queue[0])) {
      const job = this.queue.shift() as JobRecord;
      this.start(job);
    }
    this.refreshQueued();
  }

  /** Emits a new `queued` event for every queued job whose position or blocker changed. */
  private refreshQueued(): void {
    let imageAhead = false;
    this.queue.forEach((job, index) => {
      const position = index + 1;
      let waitingFor: GpuJobKind | null = null;
      if (this.runningImage || imageAhead) waitingFor = 'image';
      else if (this.runningLlm > 0 || index > 0) waitingFor = 'llm';
      if (job.history.length === 0 || job.position !== position || job.waitingFor !== waitingFor) {
        job.position = position;
        job.waitingFor = waitingFor;
        this.emit(job);
      }
      if (job.kind === 'image') imageAhead = true;
    });
  }

  private start(job: JobRecord): void {
    job.status = 'running';
    job.startedAt = this.options.now();
    job.position = null;
    job.waitingFor = null;
    if (job.kind === 'image') this.runningImage = true;
    else this.runningLlm += 1;
    this.emit(job);

    const abort = new AbortController();
    job.abort = abort;
    const timeoutMs = job.kind === 'image' ? this.options.imageTimeoutMs : this.options.llmTimeoutMs;
    job.timer = setTimeout(() => {
      this.logger.warn(`GPU job ${job.id} (${job.kind}) timed out after ${timeoutMs} ms`);
      abort.abort();
      this.finish(job, 'failed', 'timeout');
    }, timeoutMs);
    job.timer.unref();

    const work = async (): Promise<unknown> => {
      if (job.kind === 'image') await this.residency.beforeImage();
      else await this.residency.beforeLlm();
      return job.run({ signal: abort.signal });
    };
    work().then(
      (value) => {
        if (job.status !== 'running') return; // late settle after a timeout
        this.finish(job, 'done', null, value);
      },
      (error: unknown) => {
        if (job.status !== 'running') return;
        // Class name only: adapter messages may carry URLs or backend bodies.
        this.logger.warn(`GPU job ${job.id} (${job.kind}) failed (${error instanceof Error ? error.name : 'unknown'})`);
        this.finish(job, 'failed', 'adapter_error');
      },
    );
  }

  private finish(job: JobRecord, status: 'done' | 'failed', errorCode: GpuJobErrorCode | null, value?: unknown): void {
    if (job.timer) clearTimeout(job.timer);
    job.timer = null;
    job.status = status;
    job.errorCode = errorCode;
    job.finishedAt = this.options.now();
    this.emit(job);
    job.subject.complete();
    if (status === 'done') job.resolve(value);
    else job.reject(new GpuJobFailedError(job.id, errorCode ?? 'adapter_error'));

    if (job.kind === 'llm') {
      void this.residency.afterLlm().catch(() => undefined);
      this.runningLlm -= 1;
      this.pump();
      return;
    }
    // Keep the GPU held until the residency hook has run, then admit the next job.
    void (async () => {
      try {
        await this.residency.afterImage();
      } catch (error) {
        this.logger.warn(`GPU residency afterImage failed (${error instanceof Error ? error.name : 'unknown'})`);
      } finally {
        this.runningImage = false;
        this.pump();
      }
    })();
  }

  private emit(job: JobRecord): void {
    const event: GpuJobEvent = {
      jobId: job.id,
      seq: job.history.length + 1,
      status: job.status,
      position: job.status === 'queued' ? job.position : null,
      waitingFor: job.status === 'queued' ? job.waitingFor : null,
      at: iso(this.options.now()),
      errorCode: job.errorCode,
    };
    job.history.push(event);
    job.subject.next(event);
  }
}

function isTerminal(status: GpuJobStatus): boolean {
  return status === 'done' || status === 'failed';
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
