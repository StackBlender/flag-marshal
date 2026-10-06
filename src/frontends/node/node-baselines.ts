import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BASELINE_PATH, type Baseline, type Baselines } from '../../core/api/index.js';

/** Committed alongside the repository, so the ratchet is shared by the whole team. */

/**
 * Baseline persistence.
 *
 * This lives in the frontend because the core never writes files. A malformed or
 * unreadable baseline is treated as absent: the alternative is failing a build
 * over a corrupted bookkeeping file, which helps nobody.
 */
export const nodeBaselines: Baselines = {
  async read(root: string): Promise<Baseline | undefined> {
    try {
      const parsed: unknown = JSON.parse(await readFile(resolve(root, BASELINE_PATH), 'utf8'));
      if (parsed === null || typeof parsed !== 'object') return undefined;
      const accepted = (parsed as { accepted?: unknown }).accepted;
      if (!Array.isArray(accepted)) return undefined;
      return { version: 1, accepted: accepted.filter((v): v is string => typeof v === 'string') };
    } catch {
      return undefined;
    }
  },

  async write(root: string, baseline: Baseline): Promise<void> {
    await writeFile(resolve(root, BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  },
};
