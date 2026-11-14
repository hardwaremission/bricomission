import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { StyleTraits } from './style-traits.js';

/** Cache of the vision descriptions, keyed by the SHA-256 of the scaled JPEG and the model id. */
export interface ReferenceTraitRepository {
  /** Stored raw traits by image hash (re-validated by the caller). */
  getMany(hashes: readonly string[], model: string): Promise<Map<string, unknown>>;
  put(hash: string, model: string, traits: StyleTraits): Promise<void>;
}

export const REFERENCE_TRAIT_REPOSITORY = Symbol('REFERENCE_TRAIT_REPOSITORY');

@Injectable()
export class PrismaReferenceTraitRepository implements ReferenceTraitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getMany(hashes: readonly string[], model: string): Promise<Map<string, unknown>> {
    if (hashes.length === 0) return new Map();
    const rows = await this.prisma.referenceStyleTrait.findMany({ where: { model, imageHash: { in: [...hashes] } } });
    return new Map(rows.map((row) => [row.imageHash, row.traits]));
  }

  async put(hash: string, model: string, traits: StyleTraits): Promise<void> {
    await this.prisma.referenceStyleTrait.upsert({
      where: { imageHash_model: { imageHash: hash, model } },
      create: { imageHash: hash, model, traits: traits as never },
      update: {},
    });
  }
}
