import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../../src/kitchen-projects/budget/budget-engine/budget-prompt.js';
import { buildBudgetMessages, selectChunks } from '../../src/kitchen-projects/budget/budget-engine/budget-prompt.js';
import { assignPriceBands, parseProductLines, renderPriceBands } from '../../src/kitchen-projects/budget/budget-engine/price-bands.js';

const chunk = (ref: number, category: string | undefined, lines: string[]): RetrievedChunk => ({ ref, catalogName: 'Cat', pageNumber: ref, text: lines.join('\n'), ...(category === undefined ? {} : { category }) });
const line = (sku: string, price: string) => `${sku} | Product ${sku} | unit | ${price} EUR`;

describe('assignPriceBands', () => {
  it('splits a category into basic, mid and premium terciles by price', () => {
    const products = assignPriceBands([chunk(1, 'worktop', [line('BM-W-1', '100.00'), line('BM-W-2', '200.00'), line('BM-W-3', '300.00'), line('BM-W-4', '400.00'), line('BM-W-5', '500.00'), line('BM-W-6', '600.00')])]);
    const band = (sku: string) => products.find((p) => p.sku === sku)?.band;
    expect(['BM-W-1', 'BM-W-2'].map(band)).toEqual(['basic', 'basic']);
    expect(['BM-W-3', 'BM-W-4'].map(band)).toEqual(['mid', 'mid']);
    expect(['BM-W-5', 'BM-W-6'].map(band)).toEqual(['premium', 'premium']);
  });

  it('three candidates give one per band; every band is used for n >= 3', () => {
    const products = assignPriceBands([chunk(1, 'worktop', [line('BM-W-1', '10.00'), line('BM-W-2', '20.00'), line('BM-W-3', '30.00'), line('BM-W-4', '40.00')])]);
    expect(new Set(products.map((p) => p.band))).toEqual(new Set(['basic', 'mid', 'premium']));
    expect(products.find((p) => p.sku === 'BM-W-4')?.band).toBe('premium');
    expect(products.find((p) => p.sku === 'BM-W-1')?.band).toBe('basic');
  });

  it('fewer than three candidates in a category: no bands', () => {
    expect(assignPriceBands([chunk(1, 'sink', [line('BM-S-1', '10.00'), line('BM-S-2', '20.00')])])).toEqual([]);
    // The same SKU printed twice is one candidate.
    expect(assignPriceBands([chunk(1, 'sink', [line('BM-S-1', '10.00'), line('BM-S-1', '10.00'), line('BM-S-2', '20.00')])])).toEqual([]);
  });

  it('groups by category across chunks and is deterministic (ties broken by SKU)', () => {
    const chunks = [chunk(1, 'worktop', [line('BM-W-2', '50.00'), line('BM-W-1', '50.00')]), chunk(2, 'worktop', [line('BM-W-3', '50.00')]), chunk(3, 'sink', [line('BM-S-1', '9.00')])];
    const a = assignPriceBands(chunks);
    const b = assignPriceBands([...chunks].reverse().map((c, i) => ({ ...c, ref: c.ref, pageNumber: i })));
    expect(a.map((p) => [p.sku, p.band]).sort()).toEqual(b.map((p) => [p.sku, p.band]).sort());
    expect(a.filter((p) => p.category === 'sink')).toEqual([]);
    expect(a.find((p) => p.sku === 'BM-W-1')?.band).toBe('basic');
    expect(a.find((p) => p.sku === 'BM-W-3')?.band).toBe('premium');
  });

  it('parses prices with a comma decimal and ignores lines without a decimal price (digits of a SKU or "300 cm" are no price)', () => {
    expect(parseProductLines(chunk(1, 'x', ['BM-SYN-WTP-300 | Oak worktop 300 cm | unit | 1.299,00 EUR'])).map((p) => p.priceCents)).toEqual([129_900n]);
    expect(parseProductLines(chunk(1, 'x', ['BM-SYN-WTP-300 | Oak worktop 300 cm | unit']))).toEqual([]);
    expect(parseProductLines(chunk(1, 'x', ['Worktops and splashbacks']))).toEqual([]);
  });
});

describe('prompt integration', () => {
  it('lists the bands per category in the prompt and tells the model to take luxury from premium', () => {
    const chunks = [chunk(1, 'worktop', [line('BM-W-1', '10.00'), line('BM-W-2', '20.00'), line('BM-W-3', '30.00')])];
    const text = renderPriceBands(assignPriceBands(chunks));
    expect(text).toBe('worktop: premium = BM-W-3; mid = BM-W-2; basic = BM-W-1');
    const messages = buildBudgetMessages({ lengthCm: 420, widthCm: 310, heightCm: 260 }, chunks, undefined, { bands: assignPriceBands(chunks), inventory: [{ category: 'worktop', count: 2, labels: ['Top'] }] });
    const prompt = messages.map((m) => String(m.content)).join('\n');
    expect(prompt).toContain('Price bands per category');
    expect(prompt).toContain('worktop: premium = BM-W-3');
    expect(prompt).toContain('2 x worktop (Top)');
    expect(prompt).toContain('luxury costs more than high');
    expect(prompt).toContain('premium band');
  });

  it('without bands or inventory the user message has neither section', () => {
    const prompt = buildBudgetMessages({ lengthCm: 420, widthCm: 310, heightCm: 260 }, [chunk(1, undefined, [line('BM-W-1', '10.00')])]).map((m) => String(m.content)).join('\n');
    expect(prompt).not.toContain('Price bands per category');
    expect(prompt).not.toContain('Room inventory');
  });

  it('selectChunks tags each chunk with the query that first returned it', () => {
    const hit = (id: string) => ({ chunkId: id, documentId: 'd', catalogName: 'C', fileName: 'f', pageNumber: 1, text: `${id} text`, score: 0.5, matchedSku: false });
    const chunks = selectChunks([[hit('a'), hit('b')], [hit('b'), hit('c')]], 10, undefined, ['base cabinet', 'worktop']);
    expect(Object.fromEntries(chunks.map((c) => [c.text, c.category]))).toEqual({ 'a text': 'base cabinet', 'b text': 'base cabinet', 'c text': 'worktop' });
  });
});
