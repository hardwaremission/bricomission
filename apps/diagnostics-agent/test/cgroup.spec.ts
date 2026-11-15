import { describe, expect, it } from 'vitest';
import {
  cpuCores,
  hostCpuPct,
  parseCounter,
  parseCpuUsageUsec,
  parseInactiveFile,
  parseMeminfo,
  parseProcs,
  parseProcStat,
  parseScopeId,
  ramMiB,
  scopeDirs,
} from '../src/cgroup.js';
import { fixture, records } from './support.js';

describe('cgroup parsers on the spike A1 fixtures', () => {
  it('reads the container id from /proc/<pid>/cgroup and ignores non-Docker processes', () => {
    expect(parseScopeId(fixture('proc-cgroup-llama-server.txt'))).toBe('8929cb1d5d519b60f6b3dd5773ae5f6a06a0e0ff297c9d829735455fbbf93602');
    expect(parseScopeId(fixture('proc-cgroup-api.txt'))).toBe('c66b690523d14894e73041889fc6d03a6503565dacbb37506bdf44ae3c7bcdcb');
    expect(parseScopeId('0::/user.slice/user-1000.slice/session-2.scope\n')).toBeNull();
    expect(parseScopeId(null)).toBeNull();
    expect(scopeDirs('abc')[0]).toBe('/sys/fs/cgroup/system.slice/docker-abc.scope');
  });

  it('parses cpu.stat, memory.current, memory.stat and cgroup.procs', () => {
    expect(parseCpuUsageUsec(fixture('cgroup-llama-server-cpu.stat'))).toBe(3618143154);
    expect(parseCounter(fixture('cgroup-llama-server-memory.current'))).toBe(2228535296);
    expect(parseInactiveFile(fixture('cgroup-llama-server-memory.stat'))).toBeGreaterThan(0);
    expect(parseProcs(fixture('cgroup-llama-server-cgroup.procs'))).toEqual([1185602, 1208225]);
    expect(parseProcs(fixture('cgroup-api-cgroup.procs'))).toEqual([1186511]);
    expect(parseCpuUsageUsec('garbage')).toBeNull();
    expect(parseCounter('max\n')).toBeNull();
    expect(parseProcs(null)).toEqual([]);
  });

  it('RAM is memory.current minus inactive_file, as docker stats', () => {
    const current = parseCounter(fixture('cgroup-llama-server-memory.current'))!;
    const inactive = parseInactiveFile(fixture('cgroup-llama-server-memory.stat'))!;
    expect(ramMiB(current, inactive)).toBeCloseTo((current - inactive) / 1048576, 6);
    expect(ramMiB(null, 5)).toBeNull();
    expect(ramMiB(10, 20)).toBe(0);
  });

  it('CPU cores come from the usage_usec delta over the monotonic delta', () => {
    expect(cpuCores({ usageUsec: 1_000_000, monoMs: 0 }, { usageUsec: 8_910_000, monoMs: 1000 })).toBeCloseTo(7.91, 2);
    expect(cpuCores(null, { usageUsec: 5, monoMs: 1000 })).toBeNull();
    // Counter reset (container recreated) and a clock that did not advance give no number.
    expect(cpuCores({ usageUsec: 900, monoMs: 0 }, { usageUsec: 100, monoMs: 1000 })).toBeNull();
    expect(cpuCores({ usageUsec: 100, monoMs: 1000 }, { usageUsec: 900, monoMs: 1000 })).toBeNull();
  });

  it('host CPU % from two recorded /proc/stat lines', () => {
    const all = records();
    const first = parseProcStat(all[0]!.hostStat)!;
    const last = parseProcStat(all[29]!.hostStat)!;
    expect(first.threads).toBe(0);
    const pct = hostCpuPct(first, last)!;
    // Recorded at peak load (llama-server experts on the CPU): between 20 % and 80 % of 32 threads.
    expect(pct).toBeGreaterThan(20);
    expect(pct).toBeLessThan(80);
    expect(hostCpuPct(null, last)).toBeNull();
    expect(hostCpuPct(last, first)).toBeNull();
    expect(parseProcStat('cpu  1 2 3 4 5 6 7 8 0 0\ncpu0 1 1 1 1\ncpu1 1 1 1 1\n')).toEqual({ total: 36, idle: 9, threads: 2 });
    expect(parseProcStat('intr 1 2 3')).toBeNull();
  });

  it('host RAM from /proc/meminfo (MemTotal - MemAvailable)', () => {
    expect(parseMeminfo('MemTotal:       65536000 kB\nMemFree:  100 kB\nMemAvailable:   32768000 kB\n')).toEqual({ totalMiB: 64000, usedMiB: 32000 });
    expect(parseMeminfo('MemTotal: 1 kB\n')).toBeNull();
    expect(parseMeminfo(null)).toBeNull();
  });
});
