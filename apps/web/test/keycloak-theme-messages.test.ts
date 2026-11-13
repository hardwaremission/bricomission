import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n/locales';

// Keycloak theme `bricomission` (feature keycloak-login-theme): message parity for the login
// pages and the code email. The 10 non-English files are agent translations without native
// review, so this test is their only gate.
const THEME = fileURLToPath(new URL('../../../infra/keycloak/themes/bricomission/', import.meta.url));
const SETS = ['login', 'email'] as const;

/** Minimal java.util.Properties reader for the theme files (no line continuations used). */
function load(set: string, locale: string): Map<string, string> {
  const text = readFileSync(`${THEME}${set}/messages/messages_${locale}.properties`, 'utf8');
  const out = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw new Error(`${set}/${locale}: malformed line "${line}"`);
    const key = line.slice(0, eq).trim();
    if (out.has(key)) throw new Error(`${set}/${locale}: duplicate key ${key}`);
    out.set(key, line.slice(eq + 1).trim());
  }
  return out;
}

/** MessageFormat arguments ({0}, {1}, ...), sorted. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\d+)\}/g)].map((m) => m[1] ?? '').sort();
}

describe.each(SETS)('keycloak theme %s messages', (set) => {
  const english = load(set, 'en');

  it('has exactly 11 messages_<locale>.properties files', () => {
    const files = readdirSync(`${THEME}${set}/messages`).sort();
    expect(files).toEqual([...LOCALES].map((l) => `messages_${l}.properties`).sort());
  });

  it.each([...LOCALES])('%s has the English key set', (locale) => {
    expect([...load(set, locale).keys()].sort()).toEqual([...english.keys()].sort());
  });

  it.each([...LOCALES])('%s has no empty values and the English placeholders per key', (locale) => {
    for (const [key, value] of load(set, locale)) {
      expect(value, `${locale}:${key}`).not.toBe('');
      expect(placeholders(value), `${locale}:${key}`).toEqual(placeholders(english.get(key) ?? ''));
    }
  });

  it.each([...LOCALES])('%s escapes apostrophes for MessageFormat (two, never one)', (locale) => {
    for (const [key, value] of load(set, locale)) {
      expect(value.replaceAll("''", ''), `${locale}:${key}`).not.toContain("'");
    }
  });
});

describe('keycloak theme', () => {
  it('declares the 11 locales in login and email theme.properties', () => {
    for (const set of SETS) {
      const props = readFileSync(`${THEME}${set}/theme.properties`, 'utf8');
      expect(props).toMatch(/^parent=base$/m);
      expect(props.match(/^locales=(.*)$/m)?.[1]?.split(',')).toEqual([...LOCALES]);
    }
  });
});
