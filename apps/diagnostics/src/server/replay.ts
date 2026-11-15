import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ReplayLine {
  /** Milliseconds since the start of the recording. */
  at: number;
  frame: 'event' | 'metrics';
  data: Record<string, unknown>;
}

/** Parses the recorded NDJSON; malformed lines are skipped, lines are ordered by `at`. */
export function parseReplay(text: string): ReplayLine[] {
  const out: ReplayLine[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const value = JSON.parse(line) as Partial<ReplayLine>;
      if (typeof value.at !== 'number' || value.at < 0) continue;
      if (value.frame !== 'event' && value.frame !== 'metrics') continue;
      if (typeof value.data !== 'object' || value.data === null) continue;
      out.push({ at: value.at, frame: value.frame, data: value.data });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function loadReplay(file: string): Promise<ReplayLine[]> {
  // The standalone server runs from the repository layout root; `next dev` and tests from the app directory.
  const candidates = [path.resolve(/* turbopackIgnore: true */ process.cwd(), file), path.resolve(/* turbopackIgnore: true */ process.cwd(), 'apps/diagnostics', file)];
  for (const candidate of candidates) {
    try {
      return parseReplay(await readFile(candidate, 'utf8'));
    } catch {
      // try the next location
    }
  }
  return [];
}

/**
 * Plays the lines with their original timing (divided by `speed`). Event times and ids are rewritten so the
 * log reads as "now" and ids stay unique and increasing across loops of the same connection.
 */
export async function playReplay(
  lines: ReplayLine[],
  speed: number,
  signal: AbortSignal,
  emit: (frame: 'event' | 'metrics', data: Record<string, unknown>, id?: number) => void,
  now: () => number = Date.now,
): Promise<void> {
  const startedAt = now();
  const firstTs = lines.find((l) => l.frame === 'event' && typeof l.data.ts === 'number')?.data.ts as number | undefined;
  let seq = 0;
  for (const line of lines) {
    const due = startedAt + line.at / speed;
    const wait = due - now();
    if (wait > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    if (signal.aborted) return;
    if (line.frame === 'event') {
      seq += 1;
      const ts = typeof line.data.ts === 'number' && firstTs !== undefined ? startedAt + (line.data.ts - firstTs) / speed : now();
      emit('event', { ...line.data, id: String(seq), ts: Math.round(ts) }, seq);
    } else {
      emit('metrics', { ...line.data, ts: now() });
    }
  }
}
