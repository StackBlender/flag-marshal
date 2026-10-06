import type { Baseline } from '../policy/evaluate.js';

/**
 * The baseline persistence port.
 *
 * The core computes a ratchet but never writes a file, so storing the accepted
 * baseline is the host's job. This is a port like `FileSystem` and `GitHistory`:
 * the CLI writes it to disk, a test keeps it in memory, and an editor frontend
 * will write it through the workspace it already has open.
 */
export interface Baselines {
  read(root: string): Promise<Baseline | undefined>;
  write(root: string, baseline: Baseline): Promise<void>;
}

/**
 * Repository-relative baseline path.
 *
 * It is committed alongside the code, so the ratchet is shared by the whole team
 * rather than living in one person's editor. Every frontend must agree on this
 * name or two of them would each maintain their own accepted debt.
 */
export const BASELINE_PATH = '.flagmarshal-baseline.json';
