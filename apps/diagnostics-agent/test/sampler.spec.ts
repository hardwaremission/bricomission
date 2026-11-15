import { describe, expect, it } from 'vitest';
import { selectContainers } from '../src/mapping.js';
import { Sampler } from '../src/sampler.js';
import { containerList, fixture, loadRecord, MemSys, PROJECT, type ProbeRecord, records, scope } from './support.js';

const LLAMA = '8929cb1d5d519b60f6b3dd5773ae5f6a06a0e0ff297c9d829735455fbbf93602';
const API = 'c66b690523d14894e73041889fc6d03a6503565dacbb37506bdf44ae3c7bcdcb';
const POSTGRES_PREFIX = '515258e01afd';
const ROUTER_PID = 1185602;
const CHILD_PID = 1208225;
const COMFY_PID = 1185741;
const API_PID = 1186511;
const PG_PID = 515;
const mono = (record: ProbeRecord): number => Number(BigInt(record.monoNs) / 1_000_000n);

/** A sampler primed with the first recorded second: api has one readable PID without GPU fds, postgres one unreadable PID. */
function setup(): { sys: MemSys; sampler: Sampler; all: ProbeRecord[]; load: (record: ProbeRecord) => void } {
  const sys = new MemSys();
  const all = records();
  const postgres = containerList().find((container) => container.Id.startsWith(POSTGRES_PREFIX))!.Id;
  const load = (record: ProbeRecord): void => {
    loadRecord(sys, record, { extraPids: { [API]: [API_PID], [postgres]: [PG_PID] } });
    sys.dirs.add(`/proc/${API_PID}/fd`);
    sys.denied.add(`/proc/${PG_PID}/fd`);
    sys.files.set('/proc/meminfo', 'MemTotal: 65536000 kB\nMemAvailable: 32768000 kB\n');
  };
  load(all[0]!);
  const sampler = new Sampler(sys);
  sampler.setContainers(selectContainers(containerList(), PROJECT));
  return { sys, sampler, all, load };
}

describe('Sampler on 30 recorded seconds at peak load (spike A1)', () => {
  it('the first tick has totals but no rates; the second has real deltas', () => {
    const { sampler, all, load } = setup();
    const first = sampler.tick(all[0]!.t, mono(all[0]!));
    expect(first.host).toEqual({ cpuPct: null, threads: 32, ramUsedMiB: 32000, ramTotalMiB: 64000, vramUsedMiB: 14621, vramTotalMiB: 16304, gpuBusyPct: 37 });
    expect(first.containers['llama-server']).toMatchObject({ state: 'running', cpuPct: null, cores: null, ramMiB: 973, vramMiB: 4458 });
    load(all[1]!);
    const second = sampler.tick(all[1]!.t, mono(all[1]!));
    const expected =
      (all[1]!.cg['8929cb1d5d51']!.usage_usec - all[0]!.cg['8929cb1d5d51']!.usage_usec) / ((mono(all[1]!) - mono(all[0]!)) * 1000);
    expect(second.containers['llama-server']!.cores).toBeCloseTo(expected, 1);
    expect(second.containers['llama-server']!.cpuPct).toBeCloseTo((expected / 32) * 100, 0);
    expect(second.host.cpuPct).toBeGreaterThan(0);
    expect(second.host.cpuPct).toBeLessThanOrEqual(100);
  });

  it('maps PIDs to containers: VRAM sums the router and its child, ComfyUI is one PID, the impostor is not api', () => {
    const { sampler, all } = setup();
    const sample = sampler.tick(all[0]!.t, mono(all[0]!));
    expect(Object.keys(sample.containers).sort()).toEqual(['api', 'comfyui', 'embedder', 'keycloak', 'llama-server', 'mailpit', 'minio', 'postgres', 'web']);
    expect(sample.containers['llama-server']!.vramMiB).toBe(Math.round((56 + 4565336) / 1024));
    expect(sample.containers.comfyui!.vramMiB).toBe(Math.round(8392604 / 1024));
    // api RAM is the real compose container (c66b...), not the probe started from the api image.
    expect(sample.containers.api!.ramMiB).toBe(Math.round((234508288 - 1273856) / 1048576));
    expect(sampler.capabilities()).toEqual({ cgroupV2: true, amdgpuFdinfo: true, kfdSysfs: true, dockerSocket: true });
  });

  it('non-GPU containers: measured zero when every PID is readable, n/a (null) when the kernel denies the fds or no PID is known', () => {
    const { sampler, all } = setup();
    const sample = sampler.tick(all[0]!.t, mono(all[0]!));
    expect(sample.containers.api).toMatchObject({ vramMiB: 0, gpuPct: 0 });
    expect(sample.containers.api!.approx).toBeUndefined();
    expect(sample.containers.postgres).toMatchObject({ state: 'running', vramMiB: null, gpuPct: null });
    expect(sample.containers.web).toMatchObject({ vramMiB: null, gpuPct: null });
    expect(sample.containers.postgres!.ramMiB).toBeGreaterThan(0);
  });

  it('GPU % of the AI containers is an attribution of the card busy %, always flagged approx', () => {
    const { sampler, all, load } = setup();
    for (const record of all) {
      load(record);
      const sample = sampler.tick(record.t, mono(record));
      const llama = sample.containers['llama-server']!;
      const comfy = sample.containers.comfyui!;
      expect(llama.approx).toBe(true);
      expect(comfy.approx).toBe(true);
      // The excerpt has no cu_occupancy, so the split is by VRAM share and sums to the card value.
      expect(llama.gpuPct! + comfy.gpuPct!).toBeCloseTo(record.card.busy, 0);
      expect(comfy.gpuPct!).toBeGreaterThan(llama.gpuPct!);
      expect(sample.host.gpuBusyPct).toBe(record.card.busy);
    }
  });

  it('whole run: average CPU of llama-server equals the cgroup counter over the 29 s window', () => {
    const { sampler, all, load } = setup();
    const cores: number[] = [];
    for (const record of all) {
      load(record);
      const value = sampler.tick(record.t, mono(record)).containers['llama-server']!.cores;
      if (value != null) cores.push(value);
    }
    expect(cores).toHaveLength(29);
    const first = all[0]!;
    const last = all[29]!;
    const overall = (last.cg['8929cb1d5d51']!.usage_usec - first.cg['8929cb1d5d51']!.usage_usec) / ((mono(last) - mono(first)) * 1000);
    expect(cores.reduce((sum, value) => sum + value, 0) / cores.length).toBeCloseTo(overall, 0);
    expect(overall).toBeGreaterThan(4); // experts run on the CPU
  });
});

describe('Sampler: occupancy attribution on the recorded 4 Hz kfd walk of a chat completion', () => {
  it('gives the whole card busy % to llama-server while its queues are occupied and holds it between spikes', () => {
    const { sys, sampler, all } = setup();
    const rows = fixture('kfd-walk-llm-chat.tsv').trim().split('\n').slice(1).map((line) => line.split('\t'));
    expect(rows.every((row) => Number(row[1]) === CHILD_PID)).toBe(true);
    const device = `/sys/class/drm/${all[0]!.card.card}/device`;
    sys.files.set(`/sys/class/kfd/kfd/proc/${COMFY_PID}/stats_18895/cu_occupancy`, '0\n');
    let nowMs = 0;
    let attributed = 0;
    let seenOccupancy = false;
    rows.forEach((row, index) => {
      sys.files.set(`/sys/class/kfd/kfd/proc/${CHILD_PID}/stats_18895/cu_occupancy`, `${row[2]}\n`);
      sys.files.set(`${device}/gpu_busy_percent`, `${row[5]}\n`);
      sampler.sampleOccupancy();
      seenOccupancy ||= Number(row[2]) > 0;
      if (index % 4 !== 3) return;
      nowMs += 1000;
      const sample = sampler.tick(nowMs, nowMs);
      const llama = sample.containers['llama-server']!;
      const comfy = sample.containers.comfyui!;
      expect(llama.approx).toBe(true);
      expect(llama.gpuPct!).toBeLessThanOrEqual(Number(row[5]));
      if (seenOccupancy) {
        // Once the chat started, ComfyUI (idle, 8 GB resident) gets nothing and llama-server the card value.
        expect(comfy.gpuPct).toBe(0);
        if (Number(row[5]) >= 10) {
          expect(llama.gpuPct).toBe(Number(row[5]));
          attributed++;
        }
      }
    });
    expect(attributed).toBeGreaterThan(10);
  });

  it('after the hold expires an occupancy-less busy card is split by VRAM share again', () => {
    const { sys, sampler } = setup();
    sys.files.set(`/sys/class/kfd/kfd/proc/${CHILD_PID}/stats_18895/cu_occupancy`, '56\n');
    sampler.sampleOccupancy();
    expect(sampler.tick(1000, 1000).containers.comfyui!.gpuPct).toBe(0);
    sys.files.set(`/sys/class/kfd/kfd/proc/${CHILD_PID}/stats_18895/cu_occupancy`, '0\n');
    for (let index = 0; index < 8; index++) sampler.sampleOccupancy();
    expect(sampler.tick(5000, 5000).containers.comfyui!.gpuPct).toBe(0); // held
    expect(sampler.tick(12_000, 12_000).containers.comfyui!.gpuPct).toBeGreaterThan(0); // expired: VRAM share
  });
});

describe('Sampler: resets, fallbacks and missing sources', () => {
  it('a counter that goes backwards and a recreated container give no CPU number for that tick', () => {
    const { sys, sampler, all, load } = setup();
    sampler.tick(all[0]!.t, mono(all[0]!));
    load(all[1]!);
    sys.files.set(`${scope(LLAMA)}/cpu.stat`, 'usage_usec 5\n');
    expect(sampler.tick(all[1]!.t, mono(all[1]!)).containers['llama-server']!.cores).toBeNull();
    // The jump from the restarted counter back to the recorded one would read 997 cores: rejected, not shown.
    load(all[2]!);
    expect(sampler.tick(all[2]!.t, mono(all[2]!)).containers['llama-server']!.cores).toBeNull();
    load(all[3]!);
    expect(sampler.tick(all[3]!.t, mono(all[3]!)).containers['llama-server']!.cores).toBeGreaterThan(1);
    // Recreated container: same service, new id, no files yet.
    const list = containerList().map((container) => (container.Id === LLAMA ? { ...container, Id: 'f'.repeat(64) } : container));
    sampler.setContainers(selectContainers(list, PROJECT));
    const sample = sampler.tick(all[3]!.t, mono(all[3]!));
    expect(sample.containers['llama-server']).toEqual({ state: 'running', cpuPct: null, cores: null, ramMiB: null, vramMiB: null, gpuPct: null });
  });

  it('the llama child vanishing (model unloaded) and coming back is followed on the same tick, without a discovery', () => {
    const { sys, sampler, all } = setup();
    sys.files.set(`${scope(LLAMA)}/cgroup.procs`, `${ROUTER_PID}\n`);
    expect(sampler.tick(all[0]!.t, mono(all[0]!)).containers['llama-server']!.vramMiB).toBe(0); // router only: 56 KiB
    sys.files.set(`${scope(LLAMA)}/cgroup.procs`, `${ROUTER_PID}\n${CHILD_PID}\n`);
    expect(sampler.tick(all[1]!.t, mono(all[1]!)).containers['llama-server']!.vramMiB).toBe(4458);
  });

  it('a young PID that opens its render fd after it appeared is picked up on the next tick', () => {
    const { sys, sampler } = setup();
    sys.links.delete(`/proc/${CHILD_PID}/fd/10`);
    sys.links.delete(`/proc/${CHILD_PID}/fd/4`);
    for (const key of [...sys.files.keys()]) if (key.startsWith(`/sys/class/kfd/kfd/proc/${CHILD_PID}/`)) sys.files.delete(key);
    sys.dirs.add(`/proc/${CHILD_PID}/fd`);
    sampler.discover();
    expect(sampler.tick(1000, 1000).containers['llama-server']!.vramMiB).toBe(0);
    sys.links.set(`/proc/${CHILD_PID}/fd/10`, '/dev/dri/renderD128');
    expect(sampler.tick(2000, 2000).containers['llama-server']!.vramMiB).toBe(4458);
  });

  it('kfd vram_* is the fallback when fdinfo of a GPU PID is unreadable', () => {
    const { sys, sampler, all } = setup();
    sys.files.delete(`/proc/${COMFY_PID}/fdinfo/7`);
    const sample = sampler.tick(all[0]!.t, mono(all[0]!));
    expect(sample.containers.comfyui!.vramMiB).toBe(Math.round(8574451712 / 1048576));
    // fdinfo of the same second read 8196 MiB: the fallback is within 1 %.
    expect(sample.containers.comfyui!.vramMiB! / 8196).toBeLessThan(1.01);
  });

  it('no amdgpu card: host VRAM and GPU are null and AI containers get no GPU %', () => {
    const { sys, all } = setup();
    for (const key of [...sys.files.keys()]) if (key.startsWith('/sys/class/drm/')) sys.files.delete(key);
    const sampler = new Sampler(sys);
    sampler.setContainers(selectContainers(containerList(), PROJECT));
    const sample = sampler.tick(all[0]!.t, mono(all[0]!));
    expect(sample.host).toMatchObject({ vramUsedMiB: null, vramTotalMiB: null, gpuBusyPct: null });
    expect(sample.containers.comfyui).toMatchObject({ vramMiB: 8196, gpuPct: null });
    expect(sample.containers.comfyui!.approx).toBeUndefined();
    expect(sample.containers.api!.ramMiB).toBeGreaterThan(0);
  });

  it('Docker unreachable: no container is reported (not even as absent) and the host strip still works', () => {
    const { sampler, all } = setup();
    sampler.setContainers(null);
    const sample = sampler.tick(all[0]!.t, mono(all[0]!));
    expect(sample.containers).toEqual({});
    expect(sample.host.ramTotalMiB).toBe(64000);
    expect(sampler.capabilities().dockerSocket).toBe(false);
  });

  it('known services without a container are absent; an exited one keeps its state and no numbers', () => {
    const { sampler, all } = setup();
    const list = containerList()
      .filter((container) => !container.Id.startsWith('5493e965dd46'))
      .map((container) => (container.Id.startsWith('c7525eb43099') ? { ...container, State: 'exited', Status: 'Exited (0) 3 seconds ago' } : container));
    sampler.setContainers(selectContainers(list, PROJECT));
    const sample = sampler.tick(all[0]!.t, mono(all[0]!));
    const empty = { cpuPct: null, cores: null, ramMiB: null, vramMiB: null, gpuPct: null };
    expect(sample.containers.embedder).toEqual({ state: 'absent', ...empty });
    expect(sample.containers.comfyui).toEqual({ state: 'exited', ...empty });
    // With ComfyUI gone the busy card is attributed to the only GPU container left.
    expect(sample.containers['llama-server']).toMatchObject({ gpuPct: 37, approx: true });
  });

  it('a drm-engine counter that moves gives an exact GPU % without the approx flag', () => {
    const { sys, sampler, all } = setup();
    const withEngine = (ns: number): void => {
      sys.files.set(`/proc/${COMFY_PID}/fdinfo/7`, `drm-driver:\tamdgpu\ndrm-client-id:\t1948\ndrm-memory-vram:\t1024 KiB\ndrm-engine-gfx:\t${ns} ns\n`);
    };
    withEngine(1_000_000_000);
    sampler.tick(1000, 1000);
    withEngine(1_250_000_000);
    const sample = sampler.tick(2000, 2000);
    expect(sample.containers.comfyui).toMatchObject({ gpuPct: 25 });
    expect(sample.containers.comfyui!.approx).toBeUndefined();
    expect(sample.containers['llama-server']!.approx).toBe(true);
    void all;
  });
});
