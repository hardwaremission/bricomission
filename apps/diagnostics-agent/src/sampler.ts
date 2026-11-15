// The sampler: discovery (every 5 s), occupancy sampling (4 Hz) and the 1 s sample (spike A1 mapping algorithm).
import type {
  DiagnosticsAgentCapabilities,
  DiagnosticsContainerMetrics,
  DiagnosticsMetricsSample,
} from '@bricomission/shared-types';
import {
  cpuCores,
  hostCpuPct,
  type HostCpuTimes,
  parseCounter,
  parseCpuUsageUsec,
  parseInactiveFile,
  parseMeminfo,
  parseProcs,
  parseProcStat,
  ramMiB,
  scopeDirs,
} from './cgroup.js';
import { type DrmFdinfo, isGpuFdTarget, parseFdinfo, sumDrmClients } from './fdinfo.js';
import { attributeGpu, type CardInfo, findCard, KFD_PROC, readCard, readCuOccupancy, readKfdVramBytes } from './kfd.js';
import { KNOWN_SERVICES, type ServiceContainer } from './mapping.js';
import type { Sys } from './sys.js';

const MIB = 1024 * 1024;
/** Ticks during which a PID without GPU fds is rescanned every second (afterwards every discovery). */
const YOUNG_PID_TICKS = 15;

export interface SamplerOptions {
  /** Occupancy samples kept per container (4 Hz x 2 s). */
  occupancyWindow?: number;
  /** How long the last non-zero occupancy share keeps attributing a busy card (ms). */
  holdMs?: number;
  cgroupRoot?: string;
  drmRoot?: string;
}

interface PidState {
  /** fds that link to a render node. */
  drmFds: string[];
  /** The PID has a `/dev/kfd` fd or a KFD sysfs entry. */
  kfd: boolean;
  /** The kernel refused to list the PID's fds (other uid without CAP_DAC_READ_SEARCH). */
  denied: boolean;
  /** Ticks since the PID was first seen (capped use: see `YOUNG_PID_TICKS`). */
  age: number;
}

interface ServiceState {
  container: ServiceContainer;
  dir: string | null;
  pids: Map<number, PidState>;
  prevCpu: { usageUsec: number; monoMs: number } | null;
  prevEngine: { ns: number; monoMs: number } | null;
  occupancy: number[];
}

const round = (value: number | null, digits: number): number | null =>
  value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));

export class Sampler {
  private readonly window: number;
  private readonly holdMs: number;
  private readonly cgroupRoot: string;
  private readonly services = new Map<string, ServiceState>();
  private readonly card: CardInfo | null;
  private dockerOk = false;
  private sawFdinfo = false;
  private prevHost: HostCpuTimes | null = null;
  private held: { shares: Record<string, number>; monoMs: number } | null = null;

  constructor(
    private readonly sys: Sys,
    options: SamplerOptions = {},
  ) {
    this.window = options.occupancyWindow ?? 8;
    this.holdMs = options.holdMs ?? 10_000;
    this.cgroupRoot = options.cgroupRoot ?? '/sys/fs/cgroup';
    this.card = findCard(sys, options.drmRoot);
  }

  capabilities(): DiagnosticsAgentCapabilities {
    return {
      cgroupV2: this.sys.readFile(`${this.cgroupRoot}/cgroup.controllers`) != null,
      amdgpuFdinfo: this.sawFdinfo,
      kfdSysfs: Array.isArray(this.sys.readdir(KFD_PROC)),
      dockerSocket: this.dockerOk,
    };
  }

  /**
   * Discovery step (every 5 s): takes the service map of the last Docker poll (`null` = Docker
   * unreachable, every container metric becomes unknown) and rescans PIDs and GPU fds.
   */
  setContainers(containers: Map<string, ServiceContainer> | null): void {
    this.dockerOk = containers != null;
    for (const name of [...this.services.keys()]) if (!containers?.has(name)) this.services.delete(name);
    if (!containers) return;
    for (const [name, container] of containers) {
      const state = this.services.get(name);
      // A recreated container has a new id and a new scope: drop every delta.
      if (!state || state.container.id !== container.id) {
        this.services.set(name, { container, dir: null, pids: new Map(), prevCpu: null, prevEngine: null, occupancy: [] });
      } else {
        state.container = container;
      }
    }
    this.discover();
  }

  /** Reads `cgroup.procs` of every running service and the GPU fds of each PID. */
  discover(): void {
    for (const state of this.services.values()) {
      if (state.container.state === 'exited') {
        state.pids.clear();
        continue;
      }
      state.dir = scopeDirs(state.container.id, this.cgroupRoot).find((dir) => this.sys.readFile(`${dir}/cgroup.procs`) != null) ?? null;
      const pids = state.dir ? parseProcs(this.sys.readFile(`${state.dir}/cgroup.procs`)) : [];
      const next = new Map<number, PidState>();
      for (const pid of pids) next.set(pid, { ...this.scanPid(pid), age: state.pids.get(pid)?.age ?? 0 });
      state.pids = next;
    }
  }

  private scanPid(pid: number): PidState {
    const kfdEntry = Array.isArray(this.sys.readdir(`${KFD_PROC}/${pid}`));
    const fds = this.sys.readdir(`/proc/${pid}/fd`);
    if (!Array.isArray(fds)) return { drmFds: [], kfd: kfdEntry, denied: fds === 'denied', age: 0 };
    const drmFds: string[] = [];
    let kfd = kfdEntry;
    for (const fd of fds) {
      const kind = isGpuFdTarget(this.sys.readlink(`/proc/${pid}/fd/${fd}`));
      if (kind === 'drm') drmFds.push(fd);
      if (kind === 'kfd') kfd = true;
    }
    return { drmFds, kfd, denied: false, age: 0 };
  }

  /**
   * Every tick: follow `cgroup.procs` so a new PID (the llama-server child of a model load) is
   * scanned at once and a vanished one is dropped. Settled PIDs keep their fds until the next discovery.
   */
  private refreshPids(): void {
    for (const state of this.services.values()) {
      if (state.container.state === 'exited' || !state.dir) continue;
      const pids = parseProcs(this.sys.readFile(`${state.dir}/cgroup.procs`));
      const next = new Map<number, PidState>();
      for (const pid of pids) {
        const known = state.pids.get(pid);
        // A young PID opens its GPU fds a moment after it appears (model load): rescan it for a few ticks.
        if (known && (known.drmFds.length > 0 || known.denied || known.age >= YOUNG_PID_TICKS)) {
          next.set(pid, known);
        } else {
          next.set(pid, { ...this.scanPid(pid), age: (known?.age ?? 0) + 1 });
        }
      }
      state.pids = next;
    }
  }

  /** 4 Hz step: one `cu_occupancy` snapshot per container with a KFD process. */
  sampleOccupancy(): void {
    for (const state of this.services.values()) {
      let sum = 0;
      for (const [pid, info] of state.pids) if (info.kfd) sum += readCuOccupancy(this.sys, pid) ?? 0;
      state.occupancy.push(sum);
      if (state.occupancy.length > this.window) state.occupancy.shift();
    }
  }

  /** 1 s step. `monoMs` is a monotonic clock used for every delta; `ts` is wall time for display. */
  tick(ts: number, monoMs: number): DiagnosticsMetricsSample {
    this.refreshPids();
    const card = this.card ? readCard(this.sys, this.card) : null;
    const hostCpu = parseProcStat(this.sys.readFile('/proc/stat'));
    const memory = parseMeminfo(this.sys.readFile('/proc/meminfo'));
    const threads = hostCpu && hostCpu.threads > 0 ? hostCpu.threads : null;
    const host = {
      cpuPct: round(hostCpu ? hostCpuPct(this.prevHost, hostCpu) : null, 1),
      threads,
      ramUsedMiB: round(memory?.usedMiB ?? null, 0),
      ramTotalMiB: round(memory?.totalMiB ?? null, 0),
      vramUsedMiB: round(card?.vramUsedBytes != null ? card.vramUsedBytes / MIB : null, 0),
      vramTotalMiB: round(this.card ? this.card.vramTotalBytes / MIB : null, 0),
      gpuBusyPct: card?.busyPct ?? null,
    };
    if (hostCpu) this.prevHost = hostCpu;

    const containers: Record<string, DiagnosticsContainerMetrics> = {};
    const gpu: Record<string, { vramMiB: number; exactPct: number | null }> = {};
    const occupancy: Record<string, number> = {};
    for (const [name, state] of this.services) {
      const metrics: DiagnosticsContainerMetrics = { state: state.container.state, cpuPct: null, cores: null, ramMiB: null, vramMiB: null, gpuPct: null };
      containers[name] = metrics;
      if (state.container.state === 'exited' || !state.dir) continue;

      const usageUsec = parseCpuUsageUsec(this.sys.readFile(`${state.dir}/cpu.stat`));
      if (usageUsec != null) {
        const cur = { usageUsec, monoMs };
        let cores = cpuCores(state.prevCpu, cur);
        // More cores than the host has is a broken delta (counter restarted), not a measurement.
        if (cores != null && threads != null && cores > threads * 1.05) cores = null;
        metrics.cores = round(cores, 2);
        metrics.cpuPct = round(cores != null && threads ? Math.min(100, (cores / threads) * 100) : null, 1);
        state.prevCpu = cur;
      } else {
        state.prevCpu = null;
      }
      metrics.ramMiB = round(
        ramMiB(parseCounter(this.sys.readFile(`${state.dir}/memory.current`)), parseInactiveFile(this.sys.readFile(`${state.dir}/memory.stat`))),
        0,
      );

      // VRAM: every DRM fd of every PID, distinct clients; kfd per PID where fdinfo gave nothing.
      const infos: DrmFdinfo[] = [];
      let kfdBytes: number | null = null;
      let denied = false;
      let gpuProcess = false;
      for (const [pid, info] of state.pids) {
        denied ||= info.denied;
        let pidInfos = 0;
        for (const fd of info.drmFds) {
          const parsed = parseFdinfo(this.sys.readFile(`/proc/${pid}/fdinfo/${fd}`));
          if (parsed) {
            infos.push(parsed);
            pidInfos++;
          }
        }
        if (info.kfd || info.drmFds.length > 0) gpuProcess = true;
        if (pidInfos === 0 && info.kfd) {
          const bytes = readKfdVramBytes(this.sys, pid);
          if (bytes != null) kfdBytes = (kfdBytes ?? 0) + bytes;
        }
      }
      if (infos.length > 0) this.sawFdinfo = true;
      const drm = sumDrmClients(infos);
      if (gpuProcess && (infos.length > 0 || kfdBytes != null)) {
        const vram = drm.vramKiB / 1024 + (kfdBytes ?? 0) / MIB;
        metrics.vramMiB = round(vram, 0);
        // drm-engine-* (absent for ROCm; present on other drivers): an exact duty cycle when it moves.
        let exactPct: number | null = null;
        if (drm.engineNs != null) {
          const prev = state.prevEngine;
          const wallNs = prev ? (monoMs - prev.monoMs) * 1e6 : 0;
          const delta = prev ? drm.engineNs - prev.ns : 0;
          if (wallNs > 0 && delta > 0) exactPct = Math.min(100, (delta / wallNs) * 100);
          state.prevEngine = { ns: drm.engineNs, monoMs };
        } else {
          state.prevEngine = null;
        }
        gpu[name] = { vramMiB: vram, exactPct };
        occupancy[name] = state.occupancy.reduce((sum, value) => sum + value, 0);
      } else if (!gpuProcess && !denied && state.pids.size > 0) {
        // Every PID was readable and none holds a GPU fd: a measured zero, not a guess.
        metrics.vramMiB = 0;
        metrics.gpuPct = 0;
      }
    }

    // GPU %: exact where drm-engine counters move, otherwise the card busy % attributed (approx).
    const busy = host.gpuBusyPct;
    const names = Object.keys(gpu);
    if (names.length > 0 && busy != null) {
      const total = names.reduce((sum, name) => sum + (occupancy[name] ?? 0), 0);
      if (total > 0) {
        this.held = { shares: Object.fromEntries(names.map((name) => [name, (occupancy[name] ?? 0) / total])), monoMs };
      } else if (this.held && monoMs - this.held.monoMs > this.holdMs) {
        this.held = null;
      }
      const attributed = attributeGpu({
        busyPct: busy,
        occupancy,
        held: this.held?.shares ?? null,
        vramMiB: Object.fromEntries(names.map((name) => [name, gpu[name]!.vramMiB])),
      });
      for (const name of names) {
        const metrics = containers[name]!;
        const exact = gpu[name]!.exactPct;
        if (exact != null) {
          metrics.gpuPct = round(exact, 1);
        } else {
          metrics.gpuPct = round(attributed.pct[name] ?? 0, 1);
          metrics.approx = true;
        }
      }
    }

    if (this.dockerOk) {
      for (const name of KNOWN_SERVICES) {
        containers[name] ??= { state: 'absent', cpuPct: null, cores: null, ramMiB: null, vramMiB: null, gpuPct: null };
      }
    }
    return { ts, host, containers };
  }
}
