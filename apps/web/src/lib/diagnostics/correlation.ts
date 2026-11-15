/** Header the BFF forwards to the API (16 lowercase hex characters). */
export const CORRELATION_HEADER = 'x-correlation-id';

const VALID = /^[0-9a-f]{16}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && VALID.test(value);
}

/** 16 hex characters from 8 random bytes. */
export function mintCorrelationId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keeps a valid browser-sent id, otherwise mints one (the browser is not trusted). */
export function resolveCorrelationId(sent: string | null | undefined): string {
  return isValidCorrelationId(sent) ? sent : mintCorrelationId();
}
