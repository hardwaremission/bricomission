import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type DockerContainer, parseContainerList } from '../src/mapping.js';
import type { Sys } from '../src/sys.js';

export const fixture = (name: string): string => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

/** In-memory `Sys`: files and links by absolute path; directories are derived from the paths. */
export class MemSys implements Sys {
  files = new Map<string, string>();
  links = new Map<string, string>();
  dirs = new Set<string>();
  denied = new Set<string>();

  readFile(path: string): string | null {
    return this.files.get(path) ?? null;
  }
  readlink(path: string): string | null {
    return this.links.get(path) ?? null;
  }
  readdir(path: string): string[] | null | 'denied' {
    if (this.denied.has(path)) return 'denied';
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const key of [...this.files.keys(), ...this.links.keys(), ...this.dirs]) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]!);
    }
    return names.size > 0 || this.dirs.has(path) ? [...names] : null;
  }
}

/** One record of `samples-excerpt.ndjson` (spike A1 probe output). */
export interface ProbeRecord {
  t: number;
  monoNs: string;
  procs: { pid: number; container: string | null; cgroup: string; drm: { fd: string; target: string; info: string[] | null }[] }[];
  kfd: Record<string, Record<string, string>>;
  card: { card: string; vramTotal: number; vramUsed: number; busy: number };
  cg: Record<string, { usage_usec: number; memCurrent: number; inactive_file: number; nprocs: number } | null>;
  hostStat: string;
}

export const records = (): ProbeRecord[] =>
  fixture('samples-excerpt.ndjson')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as ProbeRecord);

export const containerList = (): DockerContainer[] => parseContainerList(JSON.parse(fixture('containers-json.json')));

export const PROJECT = 'hardwaremissionbricomission';
export const scope = (id: string): string => `/sys/fs/cgroup/system.slice/docker-${id}.scope`;

/**
 * Rebuilds the host files of one recorded second. The excerpt keeps only the aggregate `cpu`
 * line of `/proc/stat`, so `threads` cpuN lines are added (the host has 32); `extraPids` puts
 * PIDs without a GPU fd into a container (the excerpt lists GPU PIDs only).
 */
export function loadRecord(sys: MemSys, record: ProbeRecord, options: { threads?: number; extraPids?: Record<string, number[]> } = {}): void {
  sys.files.clear();
  sys.links.clear();
  sys.files.set('/sys/fs/cgroup/cgroup.controllers', 'cpu memory');
  const cpuLines = Array.from({ length: options.threads ?? 32 }, (_, index) => `cpu${index} 1 0 1 1 0 0 0 0 0 0`);
  sys.files.set('/proc/stat', [record.hostStat, ...cpuLines].join('\n'));
  const device = `/sys/class/drm/${record.card.card}/device`;
  sys.files.set(`${device}/mem_info_vram_total`, `${record.card.vramTotal}\n`);
  sys.files.set(`${device}/mem_info_vram_used`, `${record.card.vramUsed}\n`);
  sys.files.set(`${device}/gpu_busy_percent`, `${record.card.busy}\n`);
  const ids = containerList().map((container) => container.Id);
  for (const [prefix, counters] of Object.entries(record.cg)) {
    const id = ids.find((candidate) => candidate.startsWith(prefix));
    if (!id || !counters) continue;
    const pids = [...record.procs.filter((proc) => proc.container === id).map((proc) => proc.pid), ...(options.extraPids?.[id] ?? [])];
    sys.files.set(`${scope(id)}/cgroup.procs`, pids.map((pid) => `${pid}\n`).join(''));
    sys.files.set(`${scope(id)}/cpu.stat`, `usage_usec ${counters.usage_usec}\nuser_usec 0\nsystem_usec 0\n`);
    sys.files.set(`${scope(id)}/memory.current`, `${counters.memCurrent}\n`);
    sys.files.set(`${scope(id)}/memory.stat`, `anon 0\nfile 0\ninactive_file ${counters.inactive_file}\n`);
  }
  for (const proc of record.procs) {
    sys.files.set(`/proc/${proc.pid}/cgroup`, `${proc.cgroup}\n`);
    for (const fd of proc.drm) {
      sys.links.set(`/proc/${proc.pid}/fd/${fd.fd}`, fd.target);
      sys.files.set(`/proc/${proc.pid}/fdinfo/${fd.fd}`, `${(fd.info ?? []).join('\n')}\n`);
    }
  }
  for (const [pid, files] of Object.entries(record.kfd)) {
    for (const [name, value] of Object.entries(files)) sys.files.set(`/sys/class/kfd/kfd/proc/${pid}/${name}`, `${value}\n`);
  }
}
