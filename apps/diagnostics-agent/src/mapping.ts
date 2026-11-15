// Container identity: which Docker container is which compose service (spike A1 filter rules).
import type { DiagnosticsContainerState } from '@bricomission/shared-types';

/** Services always reported (state `absent` when no container exists): the 8 container nodes of the graph plus `api`. */
export const KNOWN_SERVICES = ['web', 'api', 'keycloak', 'postgres', 'minio', 'mailpit', 'llama-server', 'comfyui', 'embedder'] as const;

const LABEL_PROJECT = 'com.docker.compose.project';
const LABEL_SERVICE = 'com.docker.compose.service';
const LABEL_NUMBER = 'com.docker.compose.container-number';
const LABEL_ONEOFF = 'com.docker.compose.oneoff';

/** The fields of one `GET /containers/json` entry the agent reads. */
export interface DockerContainer {
  Id: string;
  State?: string;
  Status?: string;
  Created?: number;
  Labels?: Record<string, string> | null;
}

export interface ServiceContainer {
  id: string;
  state: Exclude<DiagnosticsContainerState, 'absent'>;
}

/** Keeps only well-formed entries of a Docker list body (anything else is ignored, never trusted). */
export function parseContainerList(body: unknown): DockerContainer[] {
  if (!Array.isArray(body)) return [];
  return body.filter(
    (entry): entry is DockerContainer =>
      typeof entry === 'object' && entry !== null && /^[0-9a-f]{64}$/.test(String((entry as DockerContainer).Id)),
  );
}

/**
 * Maps compose service name to its container. A container counts only when it is a real compose
 * service container of `project`: label `container-number` present and `oneoff` = `False`
 * (compose-built images leak `project` and `service` labels onto anything started from them,
 * and `docker compose run` containers are one-off). A running container wins over a stopped one;
 * among equals the newest `Created` wins (a recreated service briefly exists twice; without
 * `Created` the later list entry loses, Docker lists newest first).
 */
export function selectContainers(list: DockerContainer[], project: string): Map<string, ServiceContainer> {
  const chosen = new Map<string, { container: DockerContainer; running: boolean }>();
  for (const container of list) {
    const labels = container.Labels ?? {};
    const service = labels[LABEL_SERVICE];
    if (!service || labels[LABEL_PROJECT] !== project) continue;
    if (labels[LABEL_NUMBER] === undefined || labels[LABEL_ONEOFF] !== 'False') continue;
    const running = container.State === 'running';
    const current = chosen.get(service);
    const better =
      !current ||
      (running && !current.running) ||
      (running === current.running && (container.Created ?? 0) > (current.container.Created ?? 0));
    if (better) chosen.set(service, { container, running });
  }
  const result = new Map<string, ServiceContainer>();
  for (const [service, { container, running }] of chosen) {
    const unhealthy = running && /\(unhealthy\)/.test(container.Status ?? '');
    result.set(service, { id: container.Id, state: running ? (unhealthy ? 'unhealthy' : 'running') : 'exited' });
  }
  return result;
}

/** Compose project of the agent's own container, from its inspect body (`Config.Labels`). */
export function projectOfInspect(body: unknown): string | null {
  const labels = (body as { Config?: { Labels?: Record<string, string> } } | null)?.Config?.Labels;
  const project = labels?.[LABEL_PROJECT];
  return typeof project === 'string' && project.length > 0 ? project : null;
}
