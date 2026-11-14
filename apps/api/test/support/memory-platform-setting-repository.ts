import type { PlatformSettingRecord, PlatformSettingRepository } from '../../src/platform-settings/platform-settings.repository.js';

/** In-memory PlatformSettingRepository. */
export class MemoryPlatformSettingRepository implements PlatformSettingRepository {
  readonly rows = new Map<string, PlatformSettingRecord>();
  failNext: Error | null = null;

  async get(key: string): Promise<PlatformSettingRecord | null> {
    this.maybeFail();
    const row = this.rows.get(key);
    return row ? { ...row } : null;
  }

  async set(key: string, value: unknown, updatedBy: string | null, updatedAt: Date): Promise<void> {
    this.maybeFail();
    this.rows.set(key, { key, value, updatedBy, updatedAt });
  }

  private maybeFail() {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}
