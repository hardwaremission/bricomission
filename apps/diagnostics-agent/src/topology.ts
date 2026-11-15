// Model files of the llama-server router preset (`infra/ai/llama-models.ini`, mounted read-only).
import type { DiagnosticsAgentTopology } from '@bricomission/shared-types';

function baseName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.gguf$/i, '');
}

/** Parses the preset: one entry per `[section]` with its `model` and `mmproj` base names. */
export function parseModelsIni(text: string | null): DiagnosticsAgentTopology['models'] {
  if (!text) return [];
  const models: DiagnosticsAgentTopology['models'] = [];
  let current: DiagnosticsAgentTopology['models'][number] | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const section = /^\[(.+)\]$/.exec(line);
    if (section) {
      current = { id: section[1]!.trim(), model: null, mmproj: null };
      models.push(current);
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair || !current) continue;
    if (pair[1] === 'model') current.model = baseName(pair[2]!.trim());
    if (pair[1] === 'mmproj') current.mmproj = baseName(pair[2]!.trim());
  }
  return models;
}
