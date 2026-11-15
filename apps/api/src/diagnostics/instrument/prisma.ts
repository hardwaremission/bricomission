import type { Diagnostics } from '../diagnostics.types.js';

/** What the Prisma `query` log event gives us (parameters are never read). */
export interface PrismaQueryEvent {
  query: string;
  duration: number;
  timestamp?: Date;
}

const SKIPPED = /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET\b|SELECT\s+1\b|DEALLOCATE)/i;
const COALESCE_MS = 250;

/** `SELECT "KitchenProject"` style label: operation plus table, taken from the SQL text (never the parameters). */
export function describeSql(sql: string): { operation: string; table: string; vector: boolean } | undefined {
  if (SKIPPED.test(sql)) return undefined;
  const operation = /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)/i.exec(sql)?.[1]?.toUpperCase() ?? 'SQL';
  const table =
    /\bFROM\s+(?:"[^"]+"\.)?"([^"]+)"/i.exec(sql)?.[1] ??
    /\bINSERT\s+INTO\s+(?:"[^"]+"\.)?"([^"]+)"/i.exec(sql)?.[1] ??
    /\bUPDATE\s+(?:"[^"]+"\.)?"([^"]+)"/i.exec(sql)?.[1] ??
    'raw';
  return { operation, table, vector: /<=>|<->|<#>/.test(sql) };
}

interface Group {
  count: number;
  totalMs: number;
  timer: NodeJS.Timeout;
}

/**
 * Turns Prisma query log events into `data-access` > `postgres` `sql` events, coalesced per
 * correlation, operation and table inside 250 ms: the first query is emitted at once, further identical
 * ones are summed into one `xN` event when the window closes. Payload: operation, table, rows unknown, ms.
 */
export class PrismaQueryReporter {
  private readonly groups = new Map<string, Group>();

  constructor(
    private readonly diagnostics: Diagnostics,
    private readonly correlationId: () => string,
    private readonly simulated = false,
  ) {}

  report(event: PrismaQueryEvent): void {
    const info = describeSql(event.query);
    if (!info) return;
    const key = `${this.correlationId()}|${info.operation}|${info.table}`;
    const label = `${info.operation} "${info.table}"${info.vector ? ' (vector search)' : ''}`;
    const existing = this.groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalMs += event.duration;
      return;
    }
    this.diagnostics.emit({ from: 'data-access', to: 'postgres', kind: 'sql', summary: label, durationMs: event.duration, ok: true, simulated: this.simulated || undefined, payload: { operation: info.operation, table: info.table, vector: info.vector, count: 1, ms: event.duration } });
    const group: Group = {
      count: 0,
      totalMs: 0,
      timer: setTimeout(() => {
        this.groups.delete(key);
        if (group.count > 0) {
          this.diagnostics.emit({ from: 'data-access', to: 'postgres', kind: 'sql', summary: `${label} x${group.count} more`, durationMs: group.totalMs, ok: true, payload: { operation: info.operation, table: info.table, vector: info.vector, count: group.count, ms: group.totalMs } });
        }
      }, COALESCE_MS),
    };
    group.timer.unref();
    this.groups.set(key, group);
  }
}
