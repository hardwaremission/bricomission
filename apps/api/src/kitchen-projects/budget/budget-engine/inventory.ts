import type { LlmMessage } from '../../../ai/adapters/llm-adapter.js';

/** Fixed element categories of the vision inventory (Decision 11). Counts are quantities, never amounts. */
export const INVENTORY_CATEGORIES = [
  'base_cabinet',
  'wall_cabinet',
  'tall_cabinet',
  'worktop',
  'sink',
  'tap',
  'hob',
  'oven',
  'hood',
  'fridge',
  'dishwasher',
  'backsplash',
  'flooring',
  'lighting',
  'island',
  'other',
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export interface InventoryElement {
  category: InventoryCategory;
  label: string;
  count: number;
}

/** What the vision model saw in one Render image. */
export interface RenderInventory {
  elements: InventoryElement[];
}

/** One category after merging every image: the highest count seen, up to three labels. */
export interface MergedElement {
  category: InventoryCategory;
  count: number;
  labels: string[];
}

export const LABEL_MAX_CHARS = 40;
export const COUNT_MAX = 20;
export const LABELS_PER_CATEGORY = 3;
/** Retrieval queries in total: the 8 fixed ones plus at most four more (Decision 11). */
export const QUERIES_MAX = 12;

export const INVENTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['elements'],
  properties: {
    elements: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'label', 'count'],
        properties: {
          category: { type: 'string', enum: [...INVENTORY_CATEGORIES] },
          label: { type: 'string', maxLength: LABEL_MAX_CHARS },
          count: { type: 'integer', minimum: 0, maximum: COUNT_MAX },
        },
      },
    },
  },
} as const;

const SYSTEM =
  'You list the kitchen elements visible in one photo, to price a renovation. Answer only with JSON that follows the schema. ' +
  `Use one entry per kind of element: category from the list, a short English label (at most ${LABEL_MAX_CHARS} characters, no prices, no brands) and how many you can count (0 to ${COUNT_MAX}). ` +
  'Count base cabinets and wall cabinets as separate units of doors or modules. List only what you see.';

/** Vision request of one Render image (already scaled to <= 768 px). */
export function buildInventoryMessages(image: Buffer, mime = 'image/jpeg'): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'image', data: image, mime },
        { type: 'text', text: 'List the kitchen elements in this image.' },
      ],
    },
  ];
}

function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX_CHARS);
}

/** Parses the model's text; unknown categories and unusable entries are dropped. Null when it is not the expected JSON. */
export function parseInventory(text: string): RenderInventory | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  return readStoredInventory(raw);
}

/** Re-validates a stored or parsed value (the cache is data we wrote, but a bad row must not poison a Budget). */
export function readStoredInventory(value: unknown): RenderInventory | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const list = (value as { elements?: unknown }).elements;
  if (!Array.isArray(list)) return null;
  const elements: InventoryElement[] = [];
  for (const entry of list.slice(0, 24)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { category, label, count } = entry as Record<string, unknown>;
    if (typeof category !== 'string' || !(INVENTORY_CATEGORIES as readonly string[]).includes(category)) continue;
    if (typeof count !== 'number' || !Number.isFinite(count)) continue;
    elements.push({ category: category as InventoryCategory, label: cleanLabel(label), count: Math.min(COUNT_MAX, Math.max(0, Math.round(count))) });
  }
  return { elements };
}

/**
 * Merges the inventories of every image of a Simulation. Per category the MAXIMUM count wins, so a
 * cabinet seen from two angles is not doubled; up to three distinct labels (first seen). Categories
 * whose best count is 0 are dropped. Result in `INVENTORY_CATEGORIES` order. Pure.
 */
export function mergeInventories(inventories: readonly RenderInventory[]): MergedElement[] {
  const merged = new Map<InventoryCategory, MergedElement>();
  for (const inventory of inventories) {
    for (const element of inventory.elements) {
      const entry = merged.get(element.category) ?? { category: element.category, count: 0, labels: [] };
      entry.count = Math.max(entry.count, element.count);
      const label = element.label;
      if (label && entry.labels.length < LABELS_PER_CATEGORY && !entry.labels.some((known) => known.toLowerCase() === label.toLowerCase())) entry.labels.push(label);
      merged.set(element.category, entry);
    }
  }
  return INVENTORY_CATEGORIES.flatMap((category) => {
    const entry = merged.get(category);
    return entry && entry.count > 0 ? [entry] : [];
  });
}

/** Retrieval query of a category; the ones already covered by the fixed queries add nothing. */
const CATEGORY_QUERY: Record<InventoryCategory, string> = {
  base_cabinet: 'base cabinet',
  wall_cabinet: 'wall cabinet',
  tall_cabinet: 'tall cabinet pantry unit',
  worktop: 'worktop',
  sink: 'sink and tap',
  tap: 'sink and tap',
  hob: 'hob cooktop',
  oven: 'built-in oven',
  hood: 'extractor hood',
  fridge: 'fridge freezer',
  dishwasher: 'dishwasher',
  backsplash: 'tiles',
  flooring: 'flooring',
  lighting: 'lighting',
  island: 'kitchen island',
  other: '',
};

/**
 * The fixed queries plus one per present category not already covered by them, at most `QUERIES_MAX`
 * in total (categories with the highest merged count first). Each query is its own price-band category.
 */
export function extendQueries(fixed: readonly string[], merged: readonly MergedElement[]): string[] {
  const queries = [...fixed];
  const ranked = [...merged].sort((a, b) => b.count - a.count || INVENTORY_CATEGORIES.indexOf(a.category) - INVENTORY_CATEGORIES.indexOf(b.category));
  for (const element of ranked) {
    const query = CATEGORY_QUERY[element.category];
    if (query && !queries.includes(query) && queries.length < QUERIES_MAX) queries.push(query);
  }
  return queries;
}

const LABEL_TEXT = (category: InventoryCategory): string => category.replace(/_/g, ' ');

/** Prompt lines of the merged inventory (quantities only, no amounts). */
export function renderInventory(merged: readonly MergedElement[]): string {
  return merged.map((element) => `- ${element.count} x ${LABEL_TEXT(element.category)}${element.labels.length > 0 ? ` (${element.labels.join('; ')})` : ''}`).join('\n');
}
