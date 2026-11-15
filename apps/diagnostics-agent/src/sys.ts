import { readFileSync, readdirSync, readlinkSync } from 'node:fs';

/** Read-only view of the host files the agent samples. Injected so the sampler runs on recorded fixtures. */
export interface Sys {
  /** File text, or `null` when missing or unreadable. */
  readFile(path: string): string | null;
  /** Directory entries; `null` when missing, `'denied'` when the kernel refuses (EACCES/EPERM). */
  readdir(path: string): string[] | null | 'denied';
  /** Link target, or `null`. */
  readlink(path: string): string | null;
}

/** The real file system. The agent never writes: this is the whole surface. */
export const realSys: Sys = {
  readFile(path) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
  readdir(path) {
    try {
      return readdirSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code === 'EACCES' || code === 'EPERM' ? 'denied' : null;
    }
  },
  readlink(path) {
    try {
      return readlinkSync(path);
    } catch {
      return null;
    }
  },
};
