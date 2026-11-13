import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DecryptError, open, parseSessionKey, seal, SessionKeyError } from '../src/lib/auth/db/crypto';

const key = randomBytes(32);
const aad = Buffer.from('row-1');
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1In0.sig';

describe('seal/open (AES-256-GCM)', () => {
  it('round-trips with the same key and AAD', () => {
    expect(open(key, seal(key, TOKEN, aad), aad)).toBe(TOKEN);
  });

  it('uses version byte + 12-byte IV + 16-byte tag + ciphertext, never the plaintext', () => {
    const sealed = seal(key, TOKEN, aad);
    expect(sealed[0]).toBe(1);
    expect(sealed.length).toBe(1 + 12 + 16 + Buffer.byteLength(TOKEN));
    expect(sealed.toString('latin1')).not.toContain('eyJ');
  });

  it('uses a fresh IV per value', () => {
    expect(seal(key, TOKEN, aad).equals(seal(key, TOKEN, aad))).toBe(false);
  });

  it('fails with another key, another AAD (row) or a tampered byte', () => {
    const sealed = seal(key, TOKEN, aad);
    expect(() => open(randomBytes(32), sealed, aad)).toThrow(DecryptError);
    expect(() => open(key, sealed, Buffer.from('row-2'))).toThrow(DecryptError);
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => open(key, tampered, aad)).toThrow(DecryptError);
    expect(() => open(key, Buffer.from([2, ...sealed.subarray(1)]), aad)).toThrow(DecryptError);
    expect(() => open(key, Buffer.alloc(5), aad)).toThrow(DecryptError);
  });
});

describe('parseSessionKey', () => {
  it('accepts base64 of 32 bytes', () => {
    expect(parseSessionKey(key.toString('base64')).equals(key)).toBe(true);
  });

  it.each(['', 'not base64!', Buffer.alloc(16).toString('base64'), Buffer.alloc(33).toString('base64')])('rejects %j', (value) => {
    expect(() => parseSessionKey(value)).toThrow(SessionKeyError);
  });
});
