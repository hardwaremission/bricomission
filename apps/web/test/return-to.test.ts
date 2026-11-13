import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../src/lib/auth/return-to';

describe('safeReturnTo', () => {
  it.each([
    ['/', '/'],
    ['/kitchen-projects/new', '/kitchen-projects/new'],
    ['/a?b=1#c', '/a?b=1#c'],
  ])('keeps the same-origin path %s', (input, output) => {
    expect(safeReturnTo(input)).toBe(output);
  });

  it.each([
    null,
    undefined,
    '',
    '//evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '\\\\evil.example',
    'https://evil.example/',
    'http://localhost:3100/',
    'javascript:alert(1)',
    'relative/path',
    '/\tevil',
    '/a\\b',
    `/${'a'.repeat(3000)}`,
  ])('falls back to / for %j', (input) => {
    expect(safeReturnTo(input)).toBe('/');
  });
});
