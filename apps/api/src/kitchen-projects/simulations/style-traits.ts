import { createHash } from 'node:crypto';
import type { LlmMessage } from '../../ai/adapters/llm-adapter.js';

/**
 * Style traits (feature simulations-ux-overhaul, Decision 3): what the vision model sees in one
 * reference image, and the pure code that merges the traits of all references into one short style
 * text. The merge is code, never an LLM call: terms are scored by the sum of the weights of the
 * references that mention them.
 */
export interface StyleTraits {
  palette: string[];
  materials: string[];
  cabinetStyle: string;
  lighting: string;
  keywords: string[];
}

/** One 75-token CLIP chunk holds the fixed prefix and suffix plus about this many characters of style text. */
export const STYLE_TEXT_MAX_CHARS = 160;
const TERM_MAX_CHARS = 40;
const LIST_MAX = 5;
const KEYWORDS_SHOWN = 6;

export const STYLE_TRAITS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['palette', 'materials', 'cabinetStyle', 'lighting', 'keywords'],
  properties: {
    palette: { type: 'array', maxItems: LIST_MAX, items: { type: 'string', maxLength: TERM_MAX_CHARS } },
    materials: { type: 'array', maxItems: LIST_MAX, items: { type: 'string', maxLength: TERM_MAX_CHARS } },
    cabinetStyle: { type: 'string', maxLength: TERM_MAX_CHARS },
    lighting: { type: 'string', maxLength: TERM_MAX_CHARS },
    keywords: { type: 'array', maxItems: LIST_MAX, items: { type: 'string', maxLength: TERM_MAX_CHARS } },
  },
} as const;

const SYSTEM =
  'You describe the interior design style of one kitchen photo for an image generator. Answer only with JSON that follows the schema. ' +
  'Use short lowercase English noun phrases (1-3 words): palette = main colours, materials = visible materials and finishes, cabinetStyle = the cabinet door style, ' +
  'lighting = the light, keywords = up to five style words. Describe only what you see; never mention prices, brands or people.';

/** Vision request of one reference image (already scaled to <= 768 px). */
export function buildStyleTraitsMessages(image: Buffer, mime = 'image/jpeg'): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'image', data: image, mime },
        { type: 'text', text: 'Describe the style of this kitchen.' },
      ],
    },
  ];
}

function cleanTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const term = value.toLowerCase().replace(/[^\p{L}\p{N} '-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return term.length > 0 ? term.slice(0, TERM_MAX_CHARS) : null;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanTerm).filter((term): term is string => term !== null))].slice(0, LIST_MAX);
}

/** Validates the model's JSON; null when it is not an object with at least one usable term. */
export function parseStyleTraits(text: string): StyleTraits | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const traits: StyleTraits = {
    palette: cleanList(obj.palette),
    materials: cleanList(obj.materials),
    cabinetStyle: cleanTerm(obj.cabinetStyle) ?? '',
    lighting: cleanTerm(obj.lighting) ?? '',
    keywords: cleanList(obj.keywords),
  };
  const usable = traits.palette.length + traits.materials.length + traits.keywords.length + (traits.cabinetStyle ? 1 : 0) + (traits.lighting ? 1 : 0);
  return usable > 0 ? traits : null;
}

/** Re-validates stored traits (the cache is data we wrote, but a bad row must not poison a Simulation). */
export function readStoredTraits(value: unknown): StyleTraits | null {
  return typeof value === 'object' && value !== null ? parseStyleTraits(JSON.stringify(value)) : null;
}

export function traitTerms(traits: StyleTraits): string[] {
  return [...new Set([...traits.keywords, traits.cabinetStyle, ...traits.materials, ...traits.palette, traits.lighting].filter((term) => term !== ''))];
}

export interface WeightedTraits {
  traits: StyleTraits;
  weight: number;
}

export interface MergedStyle {
  /** Comma-separated terms, at most {@link STYLE_TEXT_MAX_CHARS} characters. */
  text: string;
  /** The highest-scoring terms, for the public view. */
  keywords: string[];
}

/** Scores that differ only by float noise are equal. */
function scoreKey(score: number): number {
  return Math.round(score * 1e9);
}

function tieBreak(styleSeed: number, term: string): number {
  return createHash('sha256').update(`${styleSeed}:${term}`).digest().readUInt32BE(0);
}

/**
 * Merges the traits of all references: a term scores the sum of the weights of the references
 * that mention it (once per reference); the best terms (ties by seeded hash, so the same seed
 * gives the same text) fill the style text up to {@link STYLE_TEXT_MAX_CHARS}.
 */
export function mergeTraits(entries: readonly WeightedTraits[], styleSeed: number): MergedStyle {
  const scores = new Map<string, number>();
  for (const { traits, weight } of entries) {
    for (const term of traitTerms(traits)) scores.set(term, (scores.get(term) ?? 0) + weight);
  }
  const ranked = [...scores.entries()]
    .sort((a, b) => scoreKey(b[1]) - scoreKey(a[1]) || tieBreak(styleSeed, a[0]) - tieBreak(styleSeed, b[0]) || a[0].localeCompare(b[0]))
    .map(([term]) => term);
  const chosen: string[] = [];
  let length = 0;
  for (const term of ranked) {
    const next = length + (chosen.length > 0 ? 2 : 0) + term.length;
    if (next > STYLE_TEXT_MAX_CHARS) continue;
    chosen.push(term);
    length = next;
  }
  return { text: chosen.join(', '), keywords: ranked.slice(0, KEYWORDS_SHOWN) };
}
