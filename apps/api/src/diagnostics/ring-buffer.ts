/** One stored item with its monotonic sequence number and size. */
export interface RingEntry<T> {
  seq: number;
  value: T;
  bytes: number;
}

export interface RingBufferOptions {
  /** Most entries kept; the oldest are evicted first. */
  maxCount: number;
  /** Most bytes kept (sum of `bytes`); the oldest are evicted first. The newest entry is always kept. */
  maxBytes: number;
}

/**
 * Bounded in-memory buffer with monotonic sequence ids (first entry 1, never reused) for the
 * diagnostics replay. Pure: no timers, no I/O.
 */
export class RingBuffer<T> {
  private entries: RingEntry<T>[] = [];
  private head = 0;
  private bytes = 0;
  private nextSeq = 1;

  constructor(private readonly options: RingBufferOptions) {
    if (!(options.maxCount >= 1) || !(options.maxBytes >= 1)) throw new Error('ring buffer limits must be positive');
  }

  /** Sequence the next appended entry will get. */
  get upcomingSeq(): number {
    return this.nextSeq;
  }

  get count(): number {
    return this.entries.length - this.head;
  }

  get totalBytes(): number {
    return this.bytes;
  }

  /** 0 when empty. */
  get oldestSeq(): number {
    return this.count === 0 ? 0 : this.entries[this.head].seq;
  }

  /** 0 when empty. */
  get newestSeq(): number {
    return this.count === 0 ? 0 : this.entries[this.entries.length - 1].seq;
  }

  /** Builds the value from its sequence (so the value can carry its own id) and stores it. */
  append(build: (seq: number) => { value: T; bytes: number }): RingEntry<T> {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    const built = build(seq);
    const entry: RingEntry<T> = { seq, value: built.value, bytes: Math.max(0, built.bytes) };
    this.entries.push(entry);
    this.bytes += entry.bytes;
    this.evict();
    return entry;
  }

  /** Entries with `seq > afterSeq`, oldest first. */
  since(afterSeq: number): RingEntry<T>[] {
    const live = this.entries.slice(this.head);
    if (afterSeq < 1) return live;
    // Sequences are contiguous, so the start index is arithmetic.
    const first = this.oldestSeq;
    if (live.length === 0 || afterSeq >= this.newestSeq) return [];
    return live.slice(Math.max(0, afterSeq + 1 - first));
  }

  /** The last `n` entries, oldest first. */
  last(n: number): RingEntry<T>[] {
    const live = this.entries.slice(this.head);
    return n >= live.length ? live : n <= 0 ? [] : live.slice(live.length - n);
  }

  private evict(): void {
    while (this.count > this.options.maxCount || (this.bytes > this.options.maxBytes && this.count > 1)) {
      this.bytes -= this.entries[this.head].bytes;
      this.entries[this.head] = undefined as unknown as RingEntry<T>; // release the value now
      this.head += 1;
    }
    // Compact the backing array now and then so evicted entries can be collected.
    if (this.head > 1024 && this.head > this.entries.length / 2) {
      this.entries = this.entries.slice(this.head);
      this.head = 0;
    }
  }
}
