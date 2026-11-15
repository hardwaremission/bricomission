import type { DiagnosticsEvent } from '@bricomission/shared-types';

export const MAILPIT_POLL_MS = 2000;

/** The only fields ever read from Mailpit's list: never `Snippet`, never the body (the code is in there). */
interface MailpitSummary {
  ID?: unknown;
  Created?: unknown;
  Subject?: unknown;
  To?: unknown;
}

/** `b***@example.com`: first character of the local part only. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

/** Defence in depth: a subject is narrated, so anything that looks like a one-time code is masked. */
export function safeSubject(subject: string): string {
  return subject.replace(/\d{4,}/g, '***').slice(0, 120);
}

export function mailEvent(message: MailpitSummary): DiagnosticsEvent | null {
  if (typeof message.ID !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(message.ID)) return null;
  const ts = typeof message.Created === 'string' ? Date.parse(message.Created) : Number.NaN;
  const recipients = Array.isArray(message.To) ? message.To : [];
  const first = recipients[0] as { Address?: unknown } | undefined;
  const to = typeof first?.Address === 'string' ? maskEmail(first.Address) : 'unknown recipient';
  const subject = typeof message.Subject === 'string' ? safeSubject(message.Subject) : '';
  return {
    id: `mail-${message.ID}`,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    correlationId: 'system',
    from: 'keycloak',
    to: 'mailpit',
    kind: 'mail',
    summary: `email code sent to ${to} (subject only, never the code)`,
    payload: { subject, to, recipients: recipients.length, source: 'inferred from the Mailpit inbox list' },
    inferred: true,
  };
}

/** Messages not seen before, oldest first. The first poll only records what is already there. */
export function newMailEvents(body: unknown, seen: Set<string>, first: boolean): DiagnosticsEvent[] {
  const list = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(list)) return [];
  const out: DiagnosticsEvent[] = [];
  for (const raw of list as MailpitSummary[]) {
    const event = mailEvent(raw);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    if (!first) out.push(event);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

type Listener = (event: DiagnosticsEvent) => void;

/**
 * One probe per server process, running only while a dashboard is connected. Keycloak sends the code email
 * itself, so `keycloak > mailpit` cannot be observed: it is inferred from a new message in the inbox list.
 */
class MailpitProbe {
  private readonly listeners = new Set<Listener>();
  private readonly seen = new Set<string>();
  private readonly recent: DiagnosticsEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private first = true;
  private busy = false;

  constructor(private readonly url: string) {}

  subscribe(listener: Listener): () => void {
    for (const event of this.recent) listener(event);
    this.listeners.add(listener);
    if (!this.timer) {
      this.timer = setInterval(() => void this.poll(), MAILPIT_POLL_MS);
      this.timer.unref();
      void this.poll();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const response = await fetch(`${this.url}/api/v1/messages?limit=10`, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
      if (!response.ok) return;
      const events = newMailEvents(await response.json(), this.seen, this.first);
      this.first = false;
      for (const event of events) {
        this.recent.push(event);
        if (this.recent.length > 20) this.recent.shift();
        for (const listener of this.listeners) listener(event);
      }
    } catch {
      // Mailpit down: no inferred events; the rest of the dashboard is unaffected.
    } finally {
      this.busy = false;
    }
  }
}

const probes = new Map<string, MailpitProbe>();

export function mailpitProbe(url: string): MailpitProbe {
  let probe = probes.get(url);
  if (!probe) {
    probe = new MailpitProbe(url);
    probes.set(url, probe);
  }
  return probe;
}
