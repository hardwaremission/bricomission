import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../../src/diagnostics/ring-buffer.js';

function fill(buffer: RingBuffer<string>, n: number, bytes = 1): void {
  for (let i = 0; i < n; i += 1) buffer.append((seq) => ({ value: `e${seq}`, bytes }));
}

describe('RingBuffer', () => {
  it('starts empty with sequences from 1', () => {
    const buffer = new RingBuffer<string>({ maxCount: 5, maxBytes: 100 });
    expect([buffer.count, buffer.oldestSeq, buffer.newestSeq, buffer.upcomingSeq]).toEqual([0, 0, 0, 1]);
    expect(buffer.since(0)).toEqual([]);
    expect(buffer.last(3)).toEqual([]);
  });

  it('assigns monotonic ids that the builder can embed', () => {
    const buffer = new RingBuffer<{ id: string }>({ maxCount: 5, maxBytes: 100 });
    const a = buffer.append((seq) => ({ value: { id: String(seq) }, bytes: 1 }));
    const b = buffer.append((seq) => ({ value: { id: String(seq) }, bytes: 1 }));
    expect([a.seq, b.seq, a.value.id, b.value.id]).toEqual([1, 2, '1', '2']);
  });

  it('evicts the oldest by count and never reuses sequences', () => {
    const buffer = new RingBuffer<string>({ maxCount: 3, maxBytes: 1000 });
    fill(buffer, 5);
    expect(buffer.count).toBe(3);
    expect([buffer.oldestSeq, buffer.newestSeq]).toEqual([3, 5]);
    expect(buffer.since(0).map((e) => e.value)).toEqual(['e3', 'e4', 'e5']);
    fill(buffer, 1);
    expect(buffer.newestSeq).toBe(6);
  });

  it('evicts the oldest by bytes but always keeps the newest entry', () => {
    const buffer = new RingBuffer<string>({ maxCount: 100, maxBytes: 10 });
    fill(buffer, 4, 4); // 16 bytes -> evict down to 2 entries (8)
    expect(buffer.count).toBe(2);
    expect(buffer.totalBytes).toBe(8);
    expect(buffer.oldestSeq).toBe(3);
    buffer.append(() => ({ value: 'huge', bytes: 50 }));
    expect(buffer.count).toBe(1);
    expect(buffer.since(0).map((e) => e.value)).toEqual(['huge']);
    expect(buffer.totalBytes).toBe(50);
  });

  it('replays from a Last-Event-ID in order, including ids that were evicted or are in the future', () => {
    const buffer = new RingBuffer<string>({ maxCount: 4, maxBytes: 1000 });
    fill(buffer, 10); // keeps 7..10
    expect(buffer.since(8).map((e) => e.seq)).toEqual([9, 10]);
    expect(buffer.since(10)).toEqual([]);
    expect(buffer.since(99)).toEqual([]);
    expect(buffer.since(2).map((e) => e.seq)).toEqual([7, 8, 9, 10]); // gap: the client sees oldestSeq in hello
    expect(buffer.since(6).map((e) => e.seq)).toEqual([7, 8, 9, 10]);
    expect(buffer.last(2).map((e) => e.seq)).toEqual([9, 10]);
    expect(buffer.last(50).map((e) => e.seq)).toEqual([7, 8, 9, 10]);
  });

  it('keeps working across the internal compaction', () => {
    const buffer = new RingBuffer<string>({ maxCount: 10, maxBytes: 1_000_000 });
    fill(buffer, 5000);
    expect(buffer.count).toBe(10);
    expect(buffer.since(4995).map((e) => e.seq)).toEqual([4996, 4997, 4998, 4999, 5000]);
    expect(buffer.oldestSeq).toBe(4991);
  });

  it('rejects non-positive limits', () => {
    expect(() => new RingBuffer<string>({ maxCount: 0, maxBytes: 10 })).toThrow();
    expect(() => new RingBuffer<string>({ maxCount: 10, maxBytes: 0 })).toThrow();
  });
});
