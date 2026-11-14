import { createHash, randomBytes } from 'node:crypto';

/**
 * Anonymous draft tokens: 32 random bytes, base64url (43 characters). Only the SHA-256 of a
 * token is stored (`kitchen_project.draft_token_hash`); the token itself is returned once.
 */
export const DRAFT_TOKEN_HEADER = 'x-draft-token';
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function generateDraftToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isDraftTokenFormat(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_FORMAT.test(value);
}

export function hashDraftToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
