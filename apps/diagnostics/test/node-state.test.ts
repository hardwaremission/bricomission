import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_MS, MIN_VISIBLE_MS, RECENT_MS } from '../src/lib/state/edge-state.ts';
import { counterLine, nodeView, reduceNodes, type NodesState } from '../src/lib/state/node-state.ts';
import { ev, resetSeq } from './support.ts';

const T0 = 5_000_000;

describe('node state', () => {
  beforeEach(() => resetSeq());

  it('is working while a span is open on either side, then recently active for about 3 s, then idle', () => {
    let state: NodesState = {};
    state = reduceNodes(state, ev({ from: 'gpu-broker', to: 'ai-adapters', kind: 'queue', span: { id: 'j', phase: 'start' }, summary: 'run image job ab12' }), T0);
    expect(nodeView(state['gpu-broker'], T0 + 30_000).phase).toBe('working');
    expect(nodeView(state['ai-adapters'], T0 + 30_000).phase).toBe('working');
    state = reduceNodes(state, ev({ from: 'gpu-broker', to: 'ai-adapters', kind: 'queue', span: { id: 'j', phase: 'end' }, summary: 'image job ab12 done' }), T0 + 30_000);
    expect(nodeView(state['gpu-broker'], T0 + 30_000 + MIN_VISIBLE_MS + 1).phase).toBe('recent');
    expect(nodeView(state['gpu-broker'], T0 + 30_000 + RECENT_MS + 1).phase).toBe('idle');
  });

  it('turns only the target red on a failed call, for 3 s, and the next ok event clears it', () => {
    let state: NodesState = {};
    state = reduceNodes(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's', phase: 'start' } }), T0);
    state = reduceNodes(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image', span: { id: 's', phase: 'end' }, ok: false, summary: 'failed (timeout)' }), T0 + 10);
    expect(nodeView(state.comfyui, T0 + 1000).phase).toBe('error');
    expect(nodeView(state['ai-adapters'], T0 + 1000).phase).toBe('recent');
    expect(nodeView(state.comfyui, T0 + 10 + ERROR_MS + 1).phase).toBe('idle');
    state = reduceNodes(state, ev({ from: 'ai-adapters', to: 'comfyui', kind: 'image' }), T0 + 1500);
    expect(nodeView(state.comfyui, T0 + 1501).phase).toBe('working');
  });

  it('glows for a self event and remembers the narrated progress', () => {
    const state = reduceNodes({}, ev({ from: 'simulation-runner', to: 'simulation-runner', kind: 'step', summary: 'rendering 3 of 6' }), T0);
    expect(nodeView(state['simulation-runner'], T0 + 1).phase).toBe('working');
    expect(state['simulation-runner']?.count).toBe(1);
    expect(counterLine('simulation-runner', state['simulation-runner'], true)).toBe('render 3 of 6');
    expect(counterLine('simulation-runner', state['simulation-runner'], false)).toBe('steps 1');
  });

  it('is offline or in error from the container state, whatever the events say', () => {
    const state = reduceNodes({}, ev({ from: 'ai-adapters', to: 'llama-server', kind: 'llm', span: { id: 's', phase: 'start' }, simulated: true }), T0);
    expect(nodeView(state['llama-server'], T0, 'absent').phase).toBe('offline');
    expect(nodeView(state['llama-server'], T0, 'exited').phase).toBe('offline');
    expect(nodeView(undefined, T0, 'unhealthy').phase).toBe('error');
    expect(nodeView(state['llama-server'], T0, 'running').phase).toBe('working');
    expect(nodeView(undefined, T0, null).phase).toBe('idle');
  });

  it('does not count polling or responses, and replayed events never light a node', () => {
    let state: NodesState = {};
    state = reduceNodes(state, ev({ from: 'web', to: 'api-guards', kind: 'http', poll: true, span: { id: 'p', phase: 'start' } }), T0);
    state = reduceNodes(state, ev({ from: 'web', to: 'api-guards', kind: 'http', span: { id: 'r', phase: 'start' } }), T0, { replayed: true });
    state = reduceNodes(state, ev({ from: 'web', to: 'api-guards', kind: 'http', span: { id: 'r', phase: 'end' } }), T0, { replayed: true });
    expect(state.web?.count).toBe(1);
    expect(counterLine('web', state.web, false)).toBe('proxied 1 req');
    expect(counterLine('api-guards', state['api-guards'], false)).toBe('req 1');
    expect(nodeView(state['api-guards'], T0 + RECENT_MS + 1).phase).toBe('idle');
  });

  it('writes the module counters of the design from real events', () => {
    let state: NodesState = {};
    state = reduceNodes(state, ev({ from: 'gpu-broker', to: 'ai-adapters', kind: 'queue', span: { id: 'j', phase: 'start' }, summary: 'run image job ab12' }), T0);
    expect(counterLine('gpu-broker', state['gpu-broker'], true)).toBe('running image job');
    expect(counterLine('ai-adapters', state['ai-adapters'], true)).toBe('calls 1');
    state = reduceNodes(state, ev({ from: 'gpu-broker', to: 'residency-hook', kind: 'residency', summary: 'beforeImage: unload LLM' }), T0);
    expect(counterLine('residency-hook', state['residency-hook'], false)).toBe('LLM unloaded');
    expect(counterLine('data-access', undefined, false)).toBe('queries 0');
    expect(counterLine('browser', undefined, false)).toBe('portrait app');
  });
});
