import { describe, expect, it } from 'vitest';
import { generateDraftToken, hashDraftToken, isDraftTokenFormat } from '../../src/kitchen-projects/draft-token.js';

describe('draft tokens', () => {
  it('are 43 base64url characters from 32 random bytes', () => {
    const token = generateDraftToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(generateDraftToken()).not.toBe(token);
  });

  it('hash to 32-byte SHA-256 digests', () => {
    const token = generateDraftToken();
    const hash = hashDraftToken(token);
    expect(hash).toHaveLength(32);
    expect(hash.equals(hashDraftToken(token))).toBe(true);
    expect(hash.toString('base64url')).not.toBe(token);
  });

  it.each([undefined, null, 42, '', 'short', `${'a'.repeat(42)}=`, 'a'.repeat(44), `${'a'.repeat(42)}/`, ['x']])('rejects the format %j', (value) => {
    expect(isDraftTokenFormat(value)).toBe(false);
  });

  it('accepts generated tokens', () => {
    expect(isDraftTokenFormat(generateDraftToken())).toBe(true);
  });
});
