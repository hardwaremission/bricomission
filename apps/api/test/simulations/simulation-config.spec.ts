import { describe, expect, it } from 'vitest';
import { readSimulationConfig } from '../../src/kitchen-projects/simulations/simulation.config.js';

describe('readSimulationConfig', () => {
  it('keys the vision cache by adapter kind so fake traits never reach the real model', () => {
    expect(readSimulationConfig({}).llmModel).toBe('fake:qwen3-vl');
    expect(readSimulationConfig({ AI_ADAPTERS: 'fake', LLM_MODEL: 'x' }).llmModel).toBe('fake:x');
    expect(readSimulationConfig({ AI_ADAPTERS: 'local' }).llmModel).toBe('qwen3-vl');
    expect(readSimulationConfig({ AI_ADAPTERS: 'local', LLM_MODEL: 'other' }).llmModel).toBe('other');
  });
});
