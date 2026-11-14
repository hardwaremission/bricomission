import { describe, expect, it } from 'vitest';
import {
  buildInventoryMessages,
  extendQueries,
  INVENTORY_SCHEMA,
  mergeInventories,
  parseInventory,
  readStoredInventory,
  renderInventory,
  type RenderInventory,
} from '../../src/kitchen-projects/budget/budget-engine/inventory.js';
import { BUDGET_QUERIES } from '../../src/kitchen-projects/budget/budget-engine/budget-prompt.js';

const inv = (...elements: RenderInventory['elements']): RenderInventory => ({ elements });

describe('mergeInventories (Decision 11)', () => {
  it('takes the MAX count per category, so a cabinet seen from two angles is not doubled', () => {
    const merged = mergeInventories([
      inv({ category: 'base_cabinet', label: 'Base cabinets', count: 4 }),
      inv({ category: 'base_cabinet', label: 'Base units', count: 6 }),
      inv({ category: 'base_cabinet', label: 'Base cabinets', count: 5 }),
    ]);
    expect(merged).toEqual([{ category: 'base_cabinet', count: 6, labels: ['Base cabinets', 'Base units'] }]);
  });

  it('keeps at most three distinct labels (case-insensitive, first seen) and drops categories whose best count is 0', () => {
    const merged = mergeInventories([
      inv({ category: 'sink', label: 'Steel sink', count: 1 }, { category: 'hob', label: 'Hob', count: 0 }),
      inv({ category: 'sink', label: 'STEEL SINK', count: 1 }, { category: 'sink', label: 'Double sink', count: 1 }),
      inv({ category: 'sink', label: 'Corner sink', count: 1 }, { category: 'sink', label: 'Fourth', count: 1 }),
    ]);
    expect(merged).toEqual([{ category: 'sink', count: 1, labels: ['Steel sink', 'Double sink', 'Corner sink'] }]);
  });

  it('orders categories like the fixed list and handles no input', () => {
    const merged = mergeInventories([inv({ category: 'flooring', label: 'Tiles', count: 1 }, { category: 'worktop', label: 'Top', count: 2 })]);
    expect(merged.map((m) => m.category)).toEqual(['worktop', 'flooring']);
    expect(mergeInventories([])).toEqual([]);
  });
});

describe('parseInventory / readStoredInventory', () => {
  it('parses a valid answer, clamps counts to 0..20 and cuts labels at 40 characters', () => {
    const parsed = parseInventory(JSON.stringify({ elements: [{ category: 'oven', label: `${'x'.repeat(60)}`, count: 99 }, { category: 'fridge', label: 'A\nB', count: -3 }] }));
    expect(parsed?.elements[0]).toEqual({ category: 'oven', label: 'x'.repeat(40), count: 20 });
    expect(parsed?.elements[1]).toEqual({ category: 'fridge', label: 'A B', count: 0 });
  });

  it('drops unknown categories and bad entries; rejects non-JSON and a wrong shape', () => {
    expect(parseInventory(JSON.stringify({ elements: [{ category: 'bogus', label: 'x', count: 1 }, 7, { category: 'tap', label: 't', count: 'two' }] }))).toEqual({ elements: [] });
    expect(parseInventory('{oops')).toBeNull();
    expect(parseInventory('[]')).toBeNull();
    expect(readStoredInventory({ elements: 'no' })).toBeNull();
    expect(readStoredInventory(null)).toBeNull();
  });

  it('the schema lists the fixed categories and bounds the count', () => {
    const item = INVENTORY_SCHEMA.properties.elements.items.properties;
    expect(item.category.enum).toContain('base_cabinet');
    expect(item.category.enum).toContain('other');
    expect(item.count.maximum).toBe(20);
    expect(item.label.maxLength).toBe(40);
  });
});

describe('extendQueries', () => {
  it('keeps the fixed eight and adds one query per present category not already covered, at most 12 in total', () => {
    const merged = mergeInventories([
      inv(
        { category: 'base_cabinet', label: 'a', count: 5 },
        { category: 'sink', label: 'b', count: 1 },
        { category: 'hob', label: 'c', count: 1 },
        { category: 'oven', label: 'd', count: 1 },
        { category: 'hood', label: 'e', count: 1 },
        { category: 'fridge', label: 'f', count: 1 },
        { category: 'dishwasher', label: 'g', count: 1 },
        { category: 'island', label: 'h', count: 1 },
      ),
    ]);
    const queries = extendQueries(BUDGET_QUERIES, merged);
    expect(queries.slice(0, 8)).toEqual([...BUDGET_QUERIES]);
    expect(queries).toHaveLength(12);
    expect(new Set(queries).size).toBe(12);
    expect(queries).toContain('hob cooktop');
  });

  it('adds nothing for covered categories or an empty inventory', () => {
    expect(extendQueries(BUDGET_QUERIES, mergeInventories([inv({ category: 'base_cabinet', label: 'a', count: 2 }, { category: 'tap', label: 'b', count: 1 })]))).toEqual([...BUDGET_QUERIES]);
    expect(extendQueries(BUDGET_QUERIES, [])).toEqual([...BUDGET_QUERIES]);
  });
});

describe('prompt text', () => {
  it('renders quantities only (no amount)', () => {
    const text = renderInventory(mergeInventories([inv({ category: 'base_cabinet', label: 'Base cabinets', count: 6 })]));
    expect(text).toBe('- 6 x base cabinet (Base cabinets)');
  });

  it('the vision request carries one image part and a text part', () => {
    const messages = buildInventoryMessages(Buffer.from('jpeg'));
    expect(messages[1]?.content).toEqual([{ type: 'image', data: Buffer.from('jpeg'), mime: 'image/jpeg' }, { type: 'text', text: expect.any(String) }]);
  });
});
