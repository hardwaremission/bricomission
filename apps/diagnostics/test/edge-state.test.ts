import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_MS, MIN_VISIBLE_MS, RECENT_MS, RESPONSE_FADE_MS, STALE_SPAN_MS, edgeView, hasTransientEdges, reduceEdges, resolveEdge, type EdgesState } from '../src/lib/state/edge-state.ts';
import { ev, resetSeq } from './support.ts';

const ID = 'ai-adapters-comfyui';
const T0 = 1_000_000;

describe('span to edge state', () => {
  beforeEach(() => resetSeq());

  it('resolves an event to its structural edge, in either direction, and ignores self events and unknown hops', () => {
    expect(resolveEdge('ai-adapters', 'comfyui')).toEqual({ id: ID, direction: 'forward' });
    expect(resolveEdge('catalog-search', 'budget-engine')).toEqual({ id: 'budget-engine-catalog-search', direction: 'reverse' });
    expect(resolveEdge('llama-server', 'llama-server')).toBeNull();
    expect(resolveEdge('project-service', 'data-access')).toBeNull();
  });

  it('is active while a span is open, however long it takes', () => {
    let state: EdgesState = {};
    state = reduceEdges(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's1', phase: 'start' } }), T0);
    expect(edgeView(state[ID], T0)).toMatchObject({ phase: 'active', direction: 'forward', active: true, simulated: false });
    expect(edgeView(state[ID], T0 + 60_000)).toMatchObject({ phase: 'active', active: true });
    expect(state[ID].lastSeq).toBe(1);
  });

  it('lights the reverse direction for the response (the end event repeats from/to), green, then fades to recent and idle', () => {
    let state: EdgesState = {};
    state = reduceEdges(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's1', phase: 'start' } }), T0);
    state = reduceEdges(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's1', phase: 'end' }, ok: true, durationMs: 5000 }), T0 + 5000);
    const response = edgeView(state[ID], T0 + 5000 + 10);
    expect(response).toMatchObject({ phase: 'response', direction: 'reverse', active: true });
    expect(response.opacity).toBeGreaterThan(0.9);
    expect(edgeView(state[ID], T0 + 5000 + RESPONSE_FADE_MS - 100).opacity).toBeLessThan(0.3);
    expect(edgeView(state[ID], T0 + 5000 + RESPONSE_FADE_MS + 1)).toMatchObject({ phase: 'recent', active: false });
    expect(edgeView(state[ID], T0 + 5000 + RECENT_MS + 1)).toMatchObject({ phase: 'idle', active: false });
    expect(state[ID].lastSeq).toBe(2);
    expect(Object.keys(state[ID].open)).toEqual([]);
  });

  it('keeps a 20 ms hop visible for the minimum time before the response shows', () => {
    let state: EdgesState = {};
    state = reduceEdges(state, ev({ from: 'data-access', to: 'postgres', kind: 'sql', span: { id: 'q', phase: 'start' } }), T0);
    state = reduceEdges(state, ev({ from: 'data-access', to: 'postgres', kind: 'sql', span: { id: 'q', phase: 'end' } }), T0 + 20);
    expect(edgeView(state['data-access-postgres'], T0 + 300)).toMatchObject({ phase: 'active', direction: 'forward' });
    expect(edgeView(state['data-access-postgres'], T0 + MIN_VISIBLE_MS + 1)).toMatchObject({ phase: 'response', direction: 'reverse' });
  });

  it('pulses for an event without a span', () => {
    const state = reduceEdges({}, ev({ from: 'simulation-runner', to: 'style-engine', kind: 'compute' }), T0);
    const id = 'simulation-runner-style-engine';
    expect(edgeView(state[id], T0 + 100)).toMatchObject({ phase: 'active', direction: 'forward' });
    expect(edgeView(state[id], T0 + MIN_VISIBLE_MS + 1).phase).toBe('recent');
  });

  it('stays active until the last of several overlapping spans ends', () => {
    let state: EdgesState = {};
    state = reduceEdges(state, ev({ from: 'catalog-search', to: 'embedder', kind: 'embed', span: { id: 'a', phase: 'start' } }), T0);
    state = reduceEdges(state, ev({ from: 'catalog-search', to: 'embedder', kind: 'embed', span: { id: 'b', phase: 'start' } }), T0 + 5);
    state = reduceEdges(state, ev({ from: 'catalog-search', to: 'embedder', kind: 'embed', span: { id: 'a', phase: 'end' } }), T0 + 50);
    expect(edgeView(state['catalog-search-embedder'], T0 + 2000)).toMatchObject({ phase: 'active', direction: 'forward' });
    state = reduceEdges(state, ev({ from: 'catalog-search', to: 'embedder', kind: 'embed', span: { id: 'b', phase: 'end' } }), T0 + 2500);
    expect(edgeView(state['catalog-search-embedder'], T0 + 2501).phase).toBe('response');
  });

  it('marks fake-adapter traffic as simulated (dashed)', () => {
    let state = reduceEdges({}, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's', phase: 'start' }, simulated: true }), T0);
    expect(edgeView(state[ID], T0).simulated).toBe(true);
    state = reduceEdges(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's', phase: 'end' }, simulated: true }), T0 + 10);
    expect(edgeView(state[ID], T0 + MIN_VISIBLE_MS + 10)).toMatchObject({ phase: 'response', simulated: true });
  });

  it('turns red for 3 s when the span fails', () => {
    let state = reduceEdges({}, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's', phase: 'start' } }), T0);
    state = reduceEdges(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's', phase: 'end' }, ok: false, summary: 'failed (timeout)' }), T0 + 100);
    expect(edgeView(state[ID], T0 + 200)).toMatchObject({ phase: 'error', active: false });
    expect(edgeView(state[ID], T0 + 100 + ERROR_MS + 1).phase).toBe('idle');
  });

  it('draws an event that runs against the edge as travelling back', () => {
    const state = reduceEdges({}, ev({ from: 'catalog-search', to: 'budget-engine', kind: 'step' }), T0);
    expect(edgeView(state['budget-engine-catalog-search'], T0 + 1)).toMatchObject({ phase: 'active', direction: 'reverse' });
  });

  it('never animates polling: it only marks the edge as recently active', () => {
    const state = reduceEdges({}, ev({ from: 'web', to: 'api-guards', kind: 'http', span: { id: 'p', phase: 'start' }, poll: true }), T0);
    expect(edgeView(state['web-api-guards'], T0 + 1)).toMatchObject({ phase: 'recent', active: false });
    expect(Object.keys(state['web-api-guards'].open)).toEqual([]);
  });

  it('tracks spans and the sequence of replayed buffer events without lighting anything, except spans still open', () => {
    let state: EdgesState = {};
    state = reduceEdges(state, ev({ from: 'browser', to: 'web', kind: 'http', span: { id: 'done', phase: 'start' } }), T0, { replayed: true });
    state = reduceEdges(state, ev({ from: 'browser', to: 'web', kind: 'http', span: { id: 'done', phase: 'end' } }), T0, { replayed: true });
    expect(edgeView(state['browser-web'], T0 + 1).phase).toBe('idle');
    expect(state['browser-web'].lastSeq).toBe(2);
    state = reduceEdges(state, ev({ from: 'browser', to: 'web', kind: 'http', span: { id: 'open', phase: 'start' } }), T0, { replayed: true });
    expect(edgeView(state['browser-web'], T0 + 1).phase).toBe('active');
  });

  it('drops a span whose end never arrived after the stale limit', () => {
    const state = reduceEdges({}, ev({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', span: { id: 'lost', phase: 'start' } }), T0);
    expect(edgeView(state['ai-adapters-llama-server'], T0 + STALE_SPAN_MS + 1).phase).toBe('idle');
  });

  it('keeps the sequence of non-numeric (inferred) events out of data-last-seq and reports transient state', () => {
    let state = reduceEdges({}, ev({ from: 'keycloak', to: 'mailpit', kind: 'mail', inferred: true, id: 'mail-abc' }), T0);
    expect(state['keycloak-mailpit'].lastSeq).toBeNull();
    expect(hasTransientEdges(state, T0 + 1)).toBe(true);
    expect(hasTransientEdges(state, T0 + RECENT_MS + 1)).toBe(false);
    state = reduceEdges(state, ev({ from: 'llama-server', to: 'llama-server', kind: 'step' }), T0);
    expect(Object.keys(state)).toEqual(['keycloak-mailpit']);
  });
});
