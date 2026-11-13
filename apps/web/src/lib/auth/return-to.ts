/**
 * Post-sign-in destination. Only same-origin paths are accepted: they must start with a
 * single "/" (not "//" or "/\", which browsers treat as another host) and contain no
 * control characters. Anything else, including absolute URLs, falls back to "/".
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return '/';
  // The browser resolves the path against our origin; anything that escapes it is rejected.
  try {
    const base = 'http://return-to.invalid';
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return '/';
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}
