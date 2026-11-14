import { describe, expect, it } from 'vitest';
import { buildFeedback, buildTiers, extractBudget, isComplete, printedPricesCents, verifyAgainstChunk } from '../../src/kitchen-projects/budget/budget-engine/budget-extraction.js';
import { buildBudgetMessages, selectChunks } from '../../src/kitchen-projects/budget/budget-engine/budget-prompt.js';
import { SAMPLE_HITS } from '../support/kitchen-app.js';

const CHUNKS = SAMPLE_HITS.map((hit, index) => ({ ref: index + 1, catalogName: hit.catalogName, pageNumber: hit.pageNumber, text: hit.text }));
const item = (sku: string, price: string, ref = 1, quantity = '1') => ({ name: `Product ${sku}`, sku, chunkRef: ref, quotedPrice: price, quantity, unit: 'unit' });
const answer = (per: Record<string, object[]>) =>
  JSON.stringify({ tiers: { luxury: { items: per.luxury ?? [] }, high: { items: per.high ?? [] }, medium: { items: per.medium ?? [] }, low: { items: per.low ?? [] } } });
const good = [item('BM-SYN-WTP-300', '189.90')];

// Feature budget-tier-computation, Scenario 3 (ADR 0002 core): verification against chunk text.
describe('budget extraction and verification', () => {
  it('keeps an item whose price is printed on its SKU line and cites the chunk page', () => {
    const ex = extractBudget(answer({ luxury: good, high: good, medium: good, low: good }), CHUNKS);
    expect(ex.wellFormed).toBe(true);
    expect(ex.rejected).toEqual([]);
    expect(ex.items.luxury[0]).toMatchObject({ sku: 'BM-SYN-WTP-300', pageNumber: 3, unitPriceCents: 18990n, subtotalCents: 18990n, catalogName: 'BricoMission Sample Kitchen Catalog' });
    expect(ex.items.luxury[0]?.sourceQuote).toContain('189.90 EUR');
    expect(isComplete(ex)).toBe(true);
  });

  it('rejects a Line Item quoting 199.90 against a chunk that prints 189.90', () => {
    const ex = extractBudget(answer({ luxury: [item('BM-SYN-WTP-300', '199.90'), ...good], high: good, medium: good, low: good }), CHUNKS);
    expect(ex.rejected).toEqual([{ tier: 'luxury', index: 1, sku: 'BM-SYN-WTP-300', reason: 'price_not_in_source' }]);
    expect(ex.items.luxury).toHaveLength(1);
    expect(ex.items.luxury[0]?.unitPriceCents).toBe(18990n);
    const total = buildTiers(ex.items, 2100)[0]?.totalCents;
    expect(total).toBe(18990n); // the rejected 199.90 is in no total
  });

  it('rejects a price printed for another SKU of the same chunk, an unknown chunk, a missing SKU and bad numbers', () => {
    const ex = extractBudget(
      answer({
        luxury: [item('BM-SYN-WTP-300', '649.00'), item('BM-SYN-WTP-300', '189.90', 9), item('BM-SYN-NOPE-1', '1.00'), item('BM-SYN-WTP-240', '649.001'), item('BM-SYN-WTP-240', '649.00', 1, '0'), ...good],
        high: good,
        medium: good,
        low: good,
      }),
      CHUNKS,
    );
    expect(ex.rejected.map((r) => r.reason)).toEqual(['price_not_in_source', 'chunk_ref_unknown', 'sku_not_in_source', 'bad_price', 'bad_quantity']);
    expect(ex.items.luxury).toHaveLength(1);
  });

  it('accepts comma decimals, a trailing EUR and 189.9 for 189.90, and rejects duplicate SKUs in a tier', () => {
    const ex = extractBudget(answer({ luxury: [item('BM-SYN-WTP-300', '189,90'), item('BM-SYN-WTP-240', '649.00 EUR'), item('BM-SYN-WTP-300', '189.9')], high: good, medium: good, low: good }), CHUNKS);
    expect(ex.items.luxury.map((i) => i.sku)).toEqual(['BM-SYN-WTP-300', 'BM-SYN-WTP-240']);
    expect(ex.rejected.map((r) => r.reason)).toEqual(['duplicate_sku']);
  });

  it('reports malformed JSON and a missing tier as not well formed, and an empty tier as incomplete', () => {
    expect(extractBudget('not json', CHUNKS).wellFormed).toBe(false);
    expect(extractBudget('{"tiers":{"luxury":{"items":[]}}}', CHUNKS).wellFormed).toBe(false);
    const ex = extractBudget(answer({ luxury: good, high: good, medium: good }), CHUNKS);
    expect(ex.wellFormed).toBe(true);
    expect(isComplete(ex)).toBe(false);
    expect(buildFeedback(ex)).toContain('low');
    expect(buildFeedback(extractBudget('x', CHUNKS))).toContain('required JSON');
  });

  it('does not accept SKU digits or dimensions as prices: 300 for BM-SYN-WTP-300 and 600 for BM-SYN-CAB-060', () => {
    const chunk = { ref: 1, catalogName: 'C', pageNumber: 1, text: 'BM-SYN-WTP-300 | Oak laminate worktop 300 cm | unit | 189.90 EUR\nBM-SYN-CAB-060 | Base cabinet 600 mm | unit | 129.00 EUR' };
    expect(verifyAgainstChunk(chunk, 'BM-SYN-WTP-300', 30000n)).toEqual({ reason: 'price_not_in_source' });
    expect(verifyAgainstChunk(chunk, 'BM-SYN-CAB-060', 60000n)).toEqual({ reason: 'price_not_in_source' });
    expect(verifyAgainstChunk(chunk, 'BM-SYN-WTP-300', 18990n)).toHaveProperty('quote');
    expect(verifyAgainstChunk(chunk, 'BM-SYN-CAB-060', 12900n)).toHaveProperty('quote');
    const ex = extractBudget(answer({ luxury: [item('BM-SYN-WTP-300', '300'), ...good], high: good, medium: good, low: good }), CHUNKS);
    expect(ex.rejected).toEqual([{ tier: 'luxury', index: 1, sku: 'BM-SYN-WTP-300', reason: 'price_not_in_source' }]);
  });

  it('parses printed prices of Catalog lines', () => {
    expect(printedPricesCents('BM-X Name 1.299,00 EUR')).toContain(129900n);
    expect(printedPricesCents('BM-X 24.90 EUR 10x20')).toEqual(expect.arrayContaining([2490n, 1000n, 2000n]));
  });

  it('falls back to the chunk when the SKU lines print no decimal price', () => {
    const chunk = { ref: 1, catalogName: 'C', pageNumber: 1, text: 'BM-SYN-ABC-1 Table lamp\nPrice 45.50 EUR' };
    expect(verifyAgainstChunk(chunk, 'BM-SYN-ABC-1', 4550n)).toHaveProperty('quote');
    expect(verifyAgainstChunk(chunk, 'BM-SYN-ABC-1', 4551n)).toEqual({ reason: 'price_not_in_source' });
  });

  it('numbers chunks, caps their count and text, and puts the sources into the prompt', () => {
    const hits = [SAMPLE_HITS, SAMPLE_HITS];
    expect(selectChunks(hits, 30)).toHaveLength(2);
    expect(selectChunks(hits, 1)).toHaveLength(1);
    expect(selectChunks(hits, 30, 10)).toHaveLength(1);
    const messages = buildBudgetMessages({ lengthCm: 420, widthCm: 310, heightCm: 260 }, CHUNKS, 'retry');
    expect(messages).toHaveLength(3);
    expect(messages[1]?.content).toContain('[source 1] BricoMission Sample Kitchen Catalog, page 3');
    expect(messages[1]?.content).toContain('189.90 EUR');
    expect(messages[1]?.content).toContain('floor area 13.0 m2');
  });
});
