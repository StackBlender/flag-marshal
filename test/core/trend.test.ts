import { describe, expect, it } from 'vitest';
import { noGitHistory, readTrend, type GitHistory } from '../../src/core/api/index.js';

const BASELINE = '.flagmarshal-baseline.json';

/** A git history holding baseline snapshots, newest first, as git log returns them. */
function fakeGit(snapshots: { commit: string; timestamp: number; content?: string }[]): GitHistory {
  return {
    isAvailable: () => Promise.resolve(true),
    historyOf: () => Promise.resolve(undefined),
    revisionsOf: (path) =>
      Promise.resolve(
        path === BASELINE ? snapshots.map(({ commit, timestamp }) => ({ commit, timestamp })) : [],
      ),
    contentAt: (commit) => Promise.resolve(snapshots.find((s) => s.commit === commit)?.content),
  };
}

const withCounts = (counts: number[]) =>
  counts.map((n, i) => ({
    commit: `c${i}`,
    timestamp: 1000 + i,
    content: JSON.stringify({ version: 1, accepted: Array.from({ length: n }, (_, j) => `v${j}`) }),
  }));

describe('trend', () => {
  it('is empty when the baseline has no history', async () => {
    const trend = await readTrend(noGitHistory, BASELINE);
    expect(trend.points).toEqual([]);
    expect(trend.change).toBe(0);
  });

  it('returns points oldest first, so the direction of travel reads naturally', async () => {
    // git log is newest-first; a trend that read backwards would report debt
    // rising when it was falling.
    const trend = await readTrend(fakeGit(withCounts([1, 3, 5])), BASELINE);
    expect(trend.points.map((p) => p.accepted)).toEqual([5, 3, 1]);
  });

  it('reports a fall in debt as a negative change', async () => {
    const trend = await readTrend(fakeGit(withCounts([1, 5])), BASELINE);
    expect(trend.change).toBe(-4);
  });

  it('reports a rise as positive', async () => {
    const trend = await readTrend(fakeGit(withCounts([9, 2])), BASELINE);
    expect(trend.change).toBe(7);
  });

  it('skips a commit where the baseline was malformed', async () => {
    // History is read-only; one bad point must not cost the whole series.
    const snapshots = [
      ...withCounts([2]),
      { commit: 'bad', timestamp: 500, content: 'not json' },
      { commit: 'old', timestamp: 400, content: JSON.stringify({ version: 1, accepted: ['a'] }) },
    ];
    const trend = await readTrend(fakeGit(snapshots), BASELINE);
    expect(trend.points.map((p) => p.accepted)).toEqual([1, 2]);
  });

  it('skips a commit where the file did not exist', async () => {
    const snapshots = [...withCounts([3]), { commit: 'none', timestamp: 1 }];
    const trend = await readTrend(fakeGit(snapshots), BASELINE);
    expect(trend.points).toHaveLength(1);
  });

  it('caps how far back it reads', async () => {
    const trend = await readTrend(fakeGit(withCounts(Array(80).fill(1))), BASELINE, 10);
    expect(trend.points).toHaveLength(10);
  });
});
