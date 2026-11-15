// Pure parsers and formulas for cgroup v2 and /proc host files (spike A1, docs/spikes/diagnostics-metrics-spike.md).

const SCOPE = /docker-([0-9a-f]{64})\.scope/;
const MIB = 1024 * 1024;

/** Container id (64 hex) from the text of `/proc/<pid>/cgroup`, or `null` for a process outside a Docker scope. */
export function parseScopeId(procCgroup: string | null): string | null {
  return procCgroup ? (SCOPE.exec(procCgroup)?.[1] ?? null) : null;
}

/** Candidate cgroup directories of a container (systemd driver first, then cgroupfs). */
export function scopeDirs(containerId: string, root = '/sys/fs/cgroup'): string[] {
  return [`${root}/system.slice/docker-${containerId}.scope`, `${root}/docker/${containerId}`];
}

function field(text: string | null, key: string): number | null {
  if (!text) return null;
  const match = new RegExp(`^${key}[ \\t]+(\\d+)`, 'm').exec(text);
  return match ? Number(match[1]) : null;
}

/** `usage_usec` of `cpu.stat`. */
export function parseCpuUsageUsec(cpuStat: string | null): number | null {
  return field(cpuStat, 'usage_usec');
}

/** `inactive_file` of `memory.stat` (bytes). */
export function parseInactiveFile(memoryStat: string | null): number | null {
  return field(memoryStat, 'inactive_file');
}

/** A single non-negative integer file such as `memory.current`. */
export function parseCounter(text: string | null): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** PIDs of `cgroup.procs`. */
export function parseProcs(cgroupProcs: string | null): number[] {
  if (!cgroupProcs) return [];
  return cgroupProcs
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map(Number);
}

/**
 * CPU usage in cores (1 = one full core, `docker stats` % / 100) between two readings.
 * `null` without a previous reading, without elapsed time, or when the counter went backwards
 * (container recreated): the next tick has a clean delta.
 */
export function cpuCores(
  prev: { usageUsec: number; monoMs: number } | null,
  cur: { usageUsec: number; monoMs: number },
): number | null {
  if (!prev) return null;
  const wallUs = (cur.monoMs - prev.monoMs) * 1000;
  const used = cur.usageUsec - prev.usageUsec;
  if (wallUs <= 0 || used < 0) return null;
  return used / wallUs;
}

/** RAM as `docker stats` reports it: `memory.current - inactive_file`, in MiB. */
export function ramMiB(memoryCurrent: number | null, inactiveFile: number | null): number | null {
  if (memoryCurrent == null) return null;
  return Math.max(0, memoryCurrent - (inactiveFile ?? 0)) / MIB;
}

export interface HostCpuTimes {
  total: number;
  idle: number;
  threads: number;
}

/** Aggregate `cpu` line of `/proc/stat` (jiffies; idle = idle + iowait) and the number of `cpuN` lines. */
export function parseProcStat(procStat: string | null): HostCpuTimes | null {
  if (!procStat) return null;
  const line = /^cpu\s+(.+)$/m.exec(procStat);
  if (!line) return null;
  const values = line[1]!.trim().split(/\s+/).map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) return null;
  // guest and guest_nice (fields 9, 10) are already inside user and nice.
  const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0);
  const idle = values[3]! + (values[4] ?? 0);
  const threads = (procStat.match(/^cpu\d+\s/gm) ?? []).length;
  return { total, idle, threads };
}

/** Host CPU busy share of all threads (0-100) between two `/proc/stat` readings. */
export function hostCpuPct(prev: HostCpuTimes | null, cur: HostCpuTimes): number | null {
  if (!prev) return null;
  const total = cur.total - prev.total;
  const idle = cur.idle - prev.idle;
  if (total <= 0 || idle < 0) return null;
  return Math.min(100, Math.max(0, ((total - idle) / total) * 100));
}

/** `MemTotal` and used (`MemTotal - MemAvailable`) of `/proc/meminfo`, in MiB. */
export function parseMeminfo(meminfo: string | null): { totalMiB: number; usedMiB: number } | null {
  if (!meminfo) return null;
  const kib = (key: string): number | null => {
    const match = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(meminfo);
    return match ? Number(match[1]) : null;
  };
  const total = kib('MemTotal');
  const available = kib('MemAvailable');
  if (total == null || available == null) return null;
  return { totalMiB: total / 1024, usedMiB: (total - available) / 1024 };
}
