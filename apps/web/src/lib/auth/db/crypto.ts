import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM sealing of secrets at rest (session tokens, PKCE verifiers).
 * Format: version byte (1) + IV (12) + tag (16) + ciphertext. The AAD binds a value to
 * its row (the row's id hash), so a ciphertext copied to another row does not open.
 */
const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class SessionKeyError extends Error {}
export class DecryptError extends Error {}

/** Validates WEB_SESSION_KEY: base64 of exactly 32 bytes. */
export function parseSessionKey(base64: string): Buffer {
  const trimmed = base64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) throw new SessionKeyError('WEB_SESSION_KEY is not base64');
  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new SessionKeyError('WEB_SESSION_KEY must decode to 32 bytes');
  return key;
}

export function seal(key: Buffer, plaintext: string, aad: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function open(key: Buffer, sealed: Buffer, aad: Buffer): string {
  if (sealed.length < 1 + IV_LENGTH + TAG_LENGTH || sealed[0] !== VERSION) throw new DecryptError('unknown ciphertext format');
  const iv = sealed.subarray(1, 1 + IV_LENGTH);
  const tag = sealed.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed.subarray(1 + IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptError('ciphertext does not authenticate');
  }
}
