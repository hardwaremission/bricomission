/** Server-only configuration. The token never leaves this process: no route returns it and no client component imports this file. */
export interface ServerConfig {
  apiUrl: string;
  agentUrl: string;
  mailpitUrl: string;
  token: string;
  source: 'live' | 'replay';
  bufferSize: number;
  replayFile: string;
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const size = Number(env.DIAGNOSTICS_BUFFER_SIZE);
  return {
    apiUrl: trimSlash(env.API_INTERNAL_URL ?? 'http://api:3000'),
    agentUrl: trimSlash(env.AGENT_URL ?? 'http://diagnostics-agent:3300'),
    mailpitUrl: trimSlash(env.MAILPIT_URL ?? 'http://mailpit:8025'),
    token: env.DIAGNOSTICS_TOKEN ?? '',
    source: env.DIAGNOSTICS_SOURCE === 'replay' ? 'replay' : 'live',
    bufferSize: Number.isInteger(size) && size > 0 ? size : 1000,
    replayFile: env.DIAGNOSTICS_REPLAY_FILE ?? 'replay/demo-simulation-budget.ndjson',
  };
}
