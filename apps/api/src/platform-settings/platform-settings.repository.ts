import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PlatformSettingRecord {
  key: string;
  value: unknown;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Persistence of the `platform_setting` key/value table. Tests use an in-memory implementation. */
export interface PlatformSettingRepository {
  get(key: string): Promise<PlatformSettingRecord | null>;
  set(key: string, value: unknown, updatedBy: string | null, updatedAt: Date): Promise<void>;
}

export const PLATFORM_SETTING_REPOSITORY = Symbol('PLATFORM_SETTING_REPOSITORY');

@Injectable()
export class PrismaPlatformSettingRepository implements PlatformSettingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<PlatformSettingRecord | null> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return row ? { key: row.key, value: row.value, updatedAt: row.updatedAt, updatedBy: row.updatedBy } : null;
  }

  async set(key: string, value: unknown, updatedBy: string | null, updatedAt: Date): Promise<void> {
    const json = value as never;
    await this.prisma.platformSetting.upsert({ where: { key }, create: { key, value: json, updatedBy, updatedAt }, update: { value: json, updatedBy, updatedAt } });
  }
}
