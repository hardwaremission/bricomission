import { describe, expect, it } from 'vitest';
import { FakeLlmAdapter } from '../../src/ai/adapters/fake-llm.adapter.js';
import {
  buildStyleTraitsMessages,
  mergeTraits,
  parseStyleTraits,
  readStoredTraits,
  STYLE_TEXT_MAX_CHARS,
  type StyleTraits,
} from '../../src/kitchen-projects/simulations/style-traits.js';

const traits = (over: Partial<StyleTraits> = {}): StyleTraits => ({ palette: ['warm white'], materials: ['oak wood'], cabinetStyle: 'shaker', lighting: 'natural daylight', keywords: ['cosy'], ...over });

describe('style traits (Decision 3)', () => {
  it('parses and normalizes the vision JSON; rejects garbage', () => {
    expect(parseStyleTraits(JSON.stringify({ palette: [' Warm  White!', 'warm white'], materials: ['Oak'], cabinetStyle: 'Shaker', lighting: '', keywords: ['A', 5] }))).toEqual({
      palette: ['warm white'],
      materials: ['oak'],
      cabinetStyle: 'shaker',
      lighting: '',
      keywords: ['a'],
    });
    for (const bad of ['not json', '[]', 'null', '{}', JSON.stringify({ palette: [], materials: [], cabinetStyle: '', lighting: '', keywords: [] })]) {
      expect(parseStyleTraits(bad), bad).toBeNull();
    }
    expect(readStoredTraits({ palette: ['grey'] })).toMatchObject({ palette: ['grey'] });
    expect(readStoredTraits('x')).toBeNull();
  });

  it('merge scores a term by the sum of the weights of the references that mention it', () => {
    const a = traits({ keywords: ['minimal'], palette: ['white'], materials: [], cabinetStyle: '', lighting: '' });
    const b = traits({ keywords: ['rustic'], palette: ['white'], materials: [], cabinetStyle: '', lighting: '' });
    const heavy = mergeTraits([{ traits: a, weight: 0.8 }, { traits: b, weight: 0.2 }], 1);
    // white is in both (1.0), minimal 0.8, rustic 0.2
    expect(heavy.keywords).toEqual(['white', 'minimal', 'rustic']);
    expect(heavy.text).toBe('white, minimal, rustic');
    const flipped = mergeTraits([{ traits: a, weight: 0.2 }, { traits: b, weight: 0.8 }], 1);
    expect(flipped.keywords).toEqual(['white', 'rustic', 'minimal']);
  });

  it('merge is reproducible from the seed (ties) and stays within the character budget', () => {
    const many = (prefix: string): StyleTraits => ({
      palette: Array.from({ length: 5 }, (_, i) => `${prefix} colour number ${i}`),
      materials: Array.from({ length: 5 }, (_, i) => `${prefix} material finish ${i}`),
      cabinetStyle: `${prefix} cabinet door style`,
      lighting: `${prefix} lighting mood`,
      keywords: Array.from({ length: 5 }, (_, i) => `${prefix} keyword ${i}`),
    });
    const entries = [{ traits: many('alpha'), weight: 0.5 }, { traits: many('beta'), weight: 0.5 }];
    const one = mergeTraits(entries, 77);
    expect(mergeTraits(entries, 77)).toEqual(one);
    expect(mergeTraits(entries, 78).text).not.toBe(one.text);
    expect(one.text.length).toBeLessThanOrEqual(STYLE_TEXT_MAX_CHARS);
    expect(one.text.length).toBeGreaterThan(100);
    expect(one.keywords).toHaveLength(6);
  });

  it('the fake vision model derives traits from the image bytes (same image, same traits)', async () => {
    const fake = new FakeLlmAdapter();
    const ask = async (bytes: string) =>
      parseStyleTraits((await fake.complete({ messages: buildStyleTraitsMessages(Buffer.from(bytes)), task: 'style_traits', jsonSchema: {} }, new AbortController().signal)).text);
    const a1 = await ask('image-a');
    expect(a1).not.toBeNull();
    expect(await ask('image-a')).toEqual(a1);
    expect(await ask('image-b')).not.toEqual(a1);
    expect(a1?.palette.length).toBe(2);
    expect(a1?.keywords.length).toBe(3);
    const inventory = JSON.parse((await fake.complete({ messages: buildStyleTraitsMessages(Buffer.from('image-a')), task: 'inventory', jsonSchema: {} }, new AbortController().signal)).text);
    expect(inventory.elements.length).toBeGreaterThan(0);
    expect(inventory.elements.every((e: { count: number }) => e.count >= 1 && e.count <= 4)).toBe(true);
  });
});
