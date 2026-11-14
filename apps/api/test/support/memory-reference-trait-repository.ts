import type { ReferenceTraitRepository } from '../../src/kitchen-projects/simulations/reference-traits.repository.js';
import type { StyleTraits } from '../../src/kitchen-projects/simulations/style-traits.js';

/** In-memory cache of vision descriptions, keyed `<hash>|<model>`. */
export class MemoryReferenceTraitRepository implements ReferenceTraitRepository {
  readonly rows = new Map<string, unknown>();

  async getMany(hashes: readonly string[], model: string): Promise<Map<string, unknown>> {
    return new Map(hashes.flatMap((hash): Array<[string, unknown]> => (this.rows.has(`${hash}|${model}`) ? [[hash, this.rows.get(`${hash}|${model}`)]] : [])));
  }

  async put(hash: string, model: string, traits: StyleTraits): Promise<void> {
    this.rows.set(`${hash}|${model}`, traits);
  }
}
