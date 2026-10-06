import type { GitHistory } from '../api/git.js';
import type { Baseline } from './evaluate.js';

export interface TrendPoint {
  readonly commit: string;
  /** Unix seconds. */
  readonly timestamp: number;
  /** Accepted violations recorded in the baseline at that commit. */
  readonly accepted: number;
}

export interface Trend {
  /** Oldest first, so a reader sees the direction of travel. */
  readonly points: TrendPoint[];
  /** Change from the first recorded point to the most recent. Negative is good. */
  readonly change: number;
}

/**
 * Reconstructs flag-debt history from the baseline file's own git history.
 *
 * This is the whole trend feature, and it needs no hosted database: the baseline
 * is committed alongside the code, so every time a team tightened the ratchet
 * they left a dated record of how much debt they were carrying. Reading it back
 * is `git log` plus `git show`.
 */
export async function readTrend(git: GitHistory, baselinePath: string, limit = 50): Promise<Trend> {
  const revisions = (await git.revisionsOf(baselinePath)).slice(0, limit);
  const points: TrendPoint[] = [];

  for (const revision of revisions.reverse()) {
    const content = await git.contentAt(revision.commit, baselinePath);
    if (content === undefined) continue;

    const accepted = countAccepted(content);
    if (accepted === undefined) continue;

    points.push({ commit: revision.commit, timestamp: revision.timestamp, accepted });
  }

  const first = points[0]?.accepted ?? 0;
  const last = points[points.length - 1]?.accepted ?? 0;
  return { points, change: last - first };
}

function countAccepted(content: string): number | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    const accepted = (parsed as Partial<Baseline>).accepted;
    return Array.isArray(accepted) ? accepted.length : undefined;
  } catch {
    // A baseline that was malformed at some past commit is skipped, not fatal —
    // history is read-only and a bad point should not cost the whole series.
    return undefined;
  }
}
