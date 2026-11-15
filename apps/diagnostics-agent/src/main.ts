// Diagnostics metrics agent entry point. Samples and serves; never writes to the host or to Docker.
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { DiagnosticsAgentTopology, DiagnosticsMetricsSample } from '@bricomission/shared-types';
import { parseScopeId } from './cgroup.js';
import { dockerGet } from './docker.js';
import { parseContainerList, projectOfInspect, selectContainers } from './mapping.js';
import { Sampler } from './sampler.js';
import { createAgentServer } from './server.js';
import { realSys } from './sys.js';
import { parseModelsIni } from './topology.js';

const SAMPLE_MS = 1000;
const OCCUPANCY_MS = 250;
const DISCOVERY_MS = 5000;

const log = (message: string): void => console.log(`[diagnostics-agent] ${message}`);

async function main(): Promise<void> {
  const token = process.env.DIAGNOSTICS_TOKEN ?? '';
  const port = Number(process.env.PORT ?? 3300);
  const iniPath = process.env.LLAMA_MODELS_INI ?? '/cfg/llama-models.ini';
  const bootId = randomUUID();
  const sampler = new Sampler(realSys);
  const listeners = new Set<(sample: DiagnosticsMetricsSample) => void>();
  let last: DiagnosticsMetricsSample | null = null;
  let project: string | null = process.env.DIAGNOSTICS_COMPOSE_PROJECT || null;
  let dockerError: string | null = null;

  // Own compose project: from the label of the agent's own container, so two stacks never mix.
  const resolveProject = async (): Promise<void> => {
    if (project) return;
    const ownId = parseScopeId(realSys.readFile('/proc/self/cgroup'));
    if (!ownId) return;
    project = projectOfInspect(await dockerGet(`/containers/${ownId}/json`));
    if (project) log(`compose project resolved from the agent's own container label`);
  };

  const discover = async (): Promise<void> => {
    try {
      await resolveProject();
      if (!project) throw new Error('compose project unknown (not a compose container and DIAGNOSTICS_COMPOSE_PROJECT unset)');
      const list = parseContainerList(await dockerGet('/containers/json?all=1'));
      sampler.setContainers(selectContainers(list, project));
      if (dockerError) log('docker socket reachable again');
      dockerError = null;
    } catch (error) {
      const message = (error as Error).message;
      if (message !== dockerError) log(`container mapping unavailable: ${message}`);
      dockerError = message;
      sampler.setContainers(null);
    }
  };

  const topology = (): DiagnosticsAgentTopology => ({
    bootId,
    project,
    intervalMs: SAMPLE_MS,
    capabilities: sampler.capabilities(),
    models: parseModelsIni(realSys.readFile(iniPath)),
  });

  const server = createAgentServer(
    {
      last: () => last,
      topology,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    token,
  );

  await discover();
  sampler.tick(Date.now(), performance.now()); // primes every delta; the first served sample has real rates
  let discovering = false;
  const timers = [
    setInterval(() => {
      if (discovering) return;
      discovering = true;
      void discover().finally(() => (discovering = false));
    }, DISCOVERY_MS),
    setInterval(() => sampler.sampleOccupancy(), OCCUPANCY_MS),
    setInterval(() => {
      try {
        last = sampler.tick(Date.now(), performance.now());
        for (const listener of listeners) listener(last);
      } catch (error) {
        log(`sample failed: ${(error as Error).message}`);
      }
    }, SAMPLE_MS),
  ];

  server.listen(port, '0.0.0.0', () => {
    const capabilities = sampler.capabilities();
    log(`listening on ${port}; capabilities ${JSON.stringify(capabilities)}`);
  });

  const stop = (): void => {
    for (const timer of timers) clearInterval(timer);
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((error: unknown) => {
  console.error(`[diagnostics-agent] fatal: ${(error as Error).message}`);
  process.exit(1);
});
