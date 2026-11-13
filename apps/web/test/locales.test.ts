import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, LOCALE_NATIVE_NAMES, localeFromTag, resolveLocale } from '../src/i18n/locales';

describe('LOCALES', () => {
  it('lists the 11 MVP locales with English first and default', () => {
    expect(LOCALES).toEqual(['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('native names cover exactly LOCALES, in order, untranslated', () => {
    expect(Object.keys(LOCALE_NATIVE_NAMES)).toEqual([...LOCALES]);
    expect(Object.values(LOCALE_NATIVE_NAMES)).toEqual([
      'English', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', 'Nederlands', 'Svenska', 'Norsk', 'Dansk', 'Suomi',
    ]);
  });
});

describe('localeFromTag', () => {
  it.each([
    ['de-DE', 'de'], ['pt-BR', 'pt'], ['pt-PT', 'pt'], ['nb-NO', 'no'], ['nn', 'no'], ['no', 'no'], ['FI', 'fi'], ['en_US', 'en'],
  ])('%s -> %s', (tag, locale) => {
    expect(localeFromTag(tag)).toBe(locale);
  });

  it.each(['ja', 'zh-CN', '*', ''])('%s is unsupported', (tag) => {
    expect(localeFromTag(tag)).toBeNull();
  });
});

describe('resolveLocale(cookie, acceptLanguage)', () => {
  it.each([
    ['de-DE,de;q=0.9', 'de'],
    ['es', 'es'],
    ['en-US', 'en'],
    ['fi', 'fi'],
    ['nb-NO', 'no'],
    ['pt-BR', 'pt'],
    ['ja-JP,ja;q=0.9,fr;q=0.8', 'fr'],
    ['ja;q=0.9,sv;q=0.95', 'sv'],
    ['it;q=0.5,da;q=0.5', 'it'],
    ['nl;q=0,de;q=0.1', 'de'],
  ])('Accept-Language %j -> %s', (header, locale) => {
    expect(resolveLocale(undefined, header)).toBe(locale);
  });

  it.each([['ja-JP,ja;q=0.9'], ['*'], [''], ['ja, *;q=0.5'], ['de;q=0']])('Accept-Language %j -> null (Language Selection)', (header) => {
    expect(resolveLocale(null, header)).toBeNull();
  });

  it('null header -> null', () => {
    expect(resolveLocale(undefined, null)).toBeNull();
  });

  it('a valid cookie wins over Accept-Language', () => {
    expect(resolveLocale('fi', 'ja')).toBe('fi');
    expect(resolveLocale('fr', 'de-DE')).toBe('fr');
  });

  it('an invalid cookie is ignored', () => {
    expect(resolveLocale('xx', 'es')).toBe('es');
    expect(resolveLocale('nb', 'ja')).toBeNull();
  });
});
