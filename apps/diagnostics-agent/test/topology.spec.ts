import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseModelsIni } from '../src/topology.js';

describe('llama-models.ini', () => {
  it('reads the model and mmproj of the committed router preset', () => {
    const ini = readFileSync(fileURLToPath(new URL('../../../infra/ai/llama-models.ini', import.meta.url)), 'utf8');
    expect(parseModelsIni(ini)).toEqual([
      { id: 'qwen3-vl', model: 'Qwen3-VL-30B-A3B-Instruct-Q4_K_M', mmproj: 'Qwen3-VL-30B-A3B-Instruct-mmproj-F16' },
    ]);
  });

  it('handles several sections, comments and a missing file', () => {
    expect(parseModelsIni('version = 1\n# c\n[a]\nmodel = /m/a.gguf\n[b]\nmmproj=/m/b-mm.GGUF\nctx = 4\n')).toEqual([
      { id: 'a', model: 'a', mmproj: null },
      { id: 'b', model: null, mmproj: 'b-mm' },
    ]);
    expect(parseModelsIni(null)).toEqual([]);
  });
});
