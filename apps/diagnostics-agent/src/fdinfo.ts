// Pure parser of DRM fdinfo (`/proc/<pid>/fdinfo/<fd>` of a `/dev/dri/renderD*` fd), spike A1.

export interface DrmFdinfo {
  driver: string;
  clientId: string;
  /** `drm-memory-vram` in KiB (falls back to `drm-total-vram`). */
  vramKiB: number;
  /** Sum of every `drm-engine-*` counter in ns, or `null` when the kernel prints none (ROCm/KFD processes). */
  engineNs: number | null;
}

/** True for the fd targets that can carry GPU state. */
export function isGpuFdTarget(target: string | null): 'drm' | 'kfd' | null {
  if (!target) return null;
  if (/^\/dev\/dri\/renderD\d+$/.test(target)) return 'drm';
  if (target === '/dev/kfd') return 'kfd';
  return null;
}

function toKiB(value: string, unit: string | undefined): number {
  const amount = Number(value);
  if (unit === 'KiB') return amount;
  if (unit === 'MiB') return amount * 1024;
  if (unit === 'GiB') return amount * 1024 * 1024;
  return amount / 1024; // no unit: bytes (drm-usage-stats)
}

/** Parses one fdinfo text. `null` when it is not a DRM client (the `/dev/kfd` fd has only `pos` and `flags`). */
export function parseFdinfo(text: string | null): DrmFdinfo | null {
  if (!text) return null;
  const entries = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^(drm-[a-z0-9-]+):\s*(.*)$/.exec(line);
    if (match) entries.set(match[1]!, match[2]!.trim());
  }
  const driver = entries.get('drm-driver');
  const clientId = entries.get('drm-client-id');
  if (!driver || !clientId) return null;
  const memory = (key: string): number | null => {
    const match = /^(\d+)(?:\s+(KiB|MiB|GiB))?$/.exec(entries.get(key) ?? '');
    return match ? toKiB(match[1]!, match[2]) : null;
  };
  let engineNs: number | null = null;
  for (const [key, value] of entries) {
    if (!key.startsWith('drm-engine-') || key.startsWith('drm-engine-capacity-')) continue;
    const match = /^(\d+)\s+ns$/.exec(value);
    if (match) engineNs = (engineNs ?? 0) + Number(match[1]);
  }
  return { driver, clientId, vramKiB: memory('drm-memory-vram') ?? memory('drm-total-vram') ?? 0, engineNs };
}

/**
 * Totals of a set of DRM fds (every fd of every PID of one container). A DRM client reached
 * through several fds or PIDs is counted once (`drm-client-id`).
 */
export function sumDrmClients(infos: DrmFdinfo[]): { clients: number; vramKiB: number; engineNs: number | null } {
  const seen = new Map<string, DrmFdinfo>();
  for (const info of infos) if (!seen.has(info.clientId)) seen.set(info.clientId, info);
  let vramKiB = 0;
  let engineNs: number | null = null;
  for (const info of seen.values()) {
    vramKiB += info.vramKiB;
    if (info.engineNs != null) engineNs = (engineNs ?? 0) + info.engineNs;
  }
  return { clients: seen.size, vramKiB, engineNs };
}
