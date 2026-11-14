import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n/locales';

const DIR = fileURLToPath(new URL('../messages/', import.meta.url));
type Tree = { [key: string]: string | Tree };

function load(locale: string): Tree {
  return JSON.parse(readFileSync(`${DIR}${locale}.json`, 'utf8')) as Tree;
}

function flatten(tree: Tree, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of flatten(value, path)) out.set(k, v);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

/** ICU argument names (`{language}`, `{count, plural, ...}`), sorted. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*[,}]/g)].map((m) => m[1] ?? '').sort();
}

const english = flatten(load('en'));

describe('messages/*.json', () => {
  it('there are exactly 11 files, one per locale', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(files).toEqual([...LOCALES].sort());
  });

  it('en.json has the eleven namespaces', () => {
    expect(Object.keys(load('en')).sort()).toEqual(['auth', 'budget', 'capture', 'generate', 'home', 'language', 'meta', 'moodboard', 'project', 'results', 'status']);
  });

  describe.each([...LOCALES])('%s', (locale) => {
    const messages = flatten(load(locale));

    it('has exactly the English key set', () => {
      expect([...messages.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it('has no empty or non-string values', () => {
      for (const [key, value] of messages) {
        expect(typeof value, key).toBe('string');
        expect((value as string).trim(), key).not.toBe('');
      }
    });

    it('keeps the English ICU placeholders per key', () => {
      for (const [key, value] of english) {
        expect(placeholders(String(messages.get(key) ?? '')), key).toEqual(placeholders(String(value)));
      }
    });
  });
});
