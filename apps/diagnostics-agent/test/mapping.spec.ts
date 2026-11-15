import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dockerGet, isAllowedDockerPath } from '../src/docker.js';
import { type DockerContainer, parseContainerList, projectOfInspect, selectContainers } from '../src/mapping.js';
import { containerList, PROJECT } from './support.js';

const labels = (service: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'com.docker.compose.project': PROJECT,
  'com.docker.compose.service': service,
  'com.docker.compose.container-number': '1',
  'com.docker.compose.oneoff': 'False',
  ...extra,
});
const id = (char: string): string => char.repeat(64);

describe('container identity (recorded GET /containers/json)', () => {
  it('maps the 9 compose services and rejects the impostor that inherited the image labels', () => {
    const list = containerList();
    expect(list).toHaveLength(10);
    const map = selectContainers(list, PROJECT);
    expect([...map.keys()].sort()).toEqual(['api', 'comfyui', 'embedder', 'keycloak', 'llama-server', 'mailpit', 'minio', 'postgres', 'web']);
    // The probe container (labels project + service=api, no container-number) must not win `api`.
    expect(map.get('api')).toEqual({ id: 'c66b690523d14894e73041889fc6d03a6503565dacbb37506bdf44ae3c7bcdcb', state: 'running' });
    expect(map.get('llama-server')!.id.startsWith('8929cb1d5d51')).toBe(true);
  });

  it('ignores other projects, one-off containers and malformed entries', () => {
    expect(selectContainers(containerList(), 'another-project').size).toBe(0);
    const list: DockerContainer[] = [
      { Id: id('a'), State: 'running', Labels: labels('api', { 'com.docker.compose.oneoff': 'True' }) },
      { Id: id('b'), State: 'running', Labels: { 'com.docker.compose.project': PROJECT, 'com.docker.compose.service': 'web' } },
      { Id: id('c'), State: 'running', Labels: null },
    ];
    expect(selectContainers(list, PROJECT).size).toBe(0);
    expect(parseContainerList([{ Id: 'short' }, null, 'x', { Id: id('d') }])).toEqual([{ Id: id('d') }]);
    expect(parseContainerList({ message: 'error' })).toEqual([]);
  });

  it('newest Created wins, running beats exited, health comes from Status', () => {
    const list: DockerContainer[] = [
      { Id: id('1'), State: 'running', Status: 'Up 2 minutes (healthy)', Created: 100, Labels: labels('api') },
      { Id: id('2'), State: 'running', Status: 'Up 1 second (health: starting)', Created: 200, Labels: labels('api') },
      { Id: id('3'), State: 'exited', Status: 'Exited (0) 1 minute ago', Created: 300, Labels: labels('api') },
      { Id: id('4'), State: 'running', Status: 'Up 3 minutes (unhealthy)', Created: 100, Labels: labels('web') },
      { Id: id('5'), State: 'exited', Status: 'Exited (137) 2 hours ago', Created: 100, Labels: labels('comfyui') },
    ];
    const map = selectContainers(list, PROJECT);
    expect(map.get('api')).toEqual({ id: id('2'), state: 'running' });
    expect(map.get('web')).toEqual({ id: id('4'), state: 'unhealthy' });
    expect(map.get('comfyui')).toEqual({ id: id('5'), state: 'exited' });
  });

  it('reads the own project from an inspect body', () => {
    expect(projectOfInspect({ Config: { Labels: { 'com.docker.compose.project': 'demo' } } })).toBe('demo');
    expect(projectOfInspect({ Config: { Labels: {} } })).toBeNull();
    expect(projectOfInspect(null)).toBeNull();
  });
});

describe('Docker socket client: GET allowlist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-agent-'));
  const socket = join(dir, 'docker.sock');
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(req.url === '/containers/json' ? 200 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ Id: id('e') }]));
  });
  beforeAll(() => new Promise<void>((resolve) => server.listen(socket, resolve)));
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  it('allows only the container list and a container inspect', () => {
    expect(isAllowedDockerPath('/containers/json')).toBe(true);
    expect(isAllowedDockerPath('/containers/json?all=1')).toBe(true);
    expect(isAllowedDockerPath(`/containers/${id('a')}/json`)).toBe(true);
    for (const path of [
      '/containers/create',
      `/containers/${id('a')}/start`,
      `/containers/${id('a')}/exec`,
      `/containers/${id('a')}/json/../kill`,
      '/containers/json?all=1&filters=x',
      '/images/json',
      '/v1.47/containers/json',
      '/containers/../images/json',
      '',
    ]) {
      expect(isAllowedDockerPath(path), path).toBe(false);
    }
  });

  it('sends a GET and refuses a forbidden path before any connection', async () => {
    await expect(dockerGet('/containers/json', socket)).resolves.toEqual([{ Id: id('e') }]);
    await expect(dockerGet('/containers/create', socket)).rejects.toThrow('not allowed');
    await expect(dockerGet(`/containers/${id('a')}/json`, socket)).rejects.toThrow('HTTP 500');
    await expect(dockerGet('/containers/json', join(dir, 'missing.sock'))).rejects.toThrow();
    expect(seen).toEqual(['GET /containers/json', `GET /containers/${id('a')}/json`]);
  });
});
