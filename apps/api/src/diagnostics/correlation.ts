import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Header the web BFF forwards (and a browser may send). */
export const CORRELATION_HEADER = 'x-correlation-id';
/** Correlation id of boot-time work (recovery, sweeper). */
export const SYSTEM_CORRELATION_ID = 'system';

export interface CorrelationContext {
  correlationId: string;
  /** Set by the HTTP entry for status-polling requests: every event of the request is flagged `poll`. */
  poll?: boolean;
}

const store = new AsyncLocalStorage<CorrelationContext>();

/** 16 lowercase hex characters. */
export function mintCorrelationId(): string {
  return randomBytes(8).toString('hex');
}

/** A value we accept from outside: 16 lowercase hex characters (or `system` inside the process). */
export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
}

/** Keeps a valid caller-sent id, otherwise mints one. */
export function resolveCorrelationId(sent: unknown): string {
  const candidate = Array.isArray(sent) ? undefined : sent;
  return isValidCorrelationId(candidate) ? candidate : mintCorrelationId();
}

export function currentCorrelation(): CorrelationContext | undefined {
  return store.getStore();
}

/** Current correlation id, or `system` outside any request. */
export function currentCorrelationId(): string {
  return store.getStore()?.correlationId ?? SYSTEM_CORRELATION_ID;
}

/**
 * Runs `fn` in `ctx`. With no context it runs outside any (so a job submitted outside a request,
 * but started from another job's `finish()`, does not inherit that job's id).
 */
export function runWithCorrelation<T>(ctx: CorrelationContext | undefined, fn: () => T): T {
  return ctx ? store.run(ctx, fn) : store.exit(fn);
}

/** Express middleware: validates `X-Correlation-Id` (else mints) and opens the context for the request. */
export function correlationMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const correlationId = resolveCorrelationId(req.headers[CORRELATION_HEADER]);
  store.run({ correlationId }, next);
}
