import { describe, expect, it } from 'vitest';
import type { Evidence, FlagRecord, ScanReport } from '../../src/core/api/index.js';
import { renderScan } from '../../src/frontends/cli/render.js';
import { renderMarkdown } from '../../src/frontends/cli/render-markdown.js';
import {
  debtReasons,
  headlineParts,
  helperCandidates,
  rankByDebt,
  summarize,
} from '../../src/present/summary.js';

function flag(key: string, debtScore: number, evidence: Evidence[]): FlagRecord {
  return {
    key,
    references: [],
    inConfiguration: true,
    evidence,
    confidence: 'medium',
    debtScore,
  };
}

function report(flags: FlagRecord[], unresolved = 0): ScanReport {
  const range = { file: 'a.ts', start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
  return {
    schemaVersion: '1.0',
    tool: { name: 'flag-marshal', coreVersion: '0.0.0' },
    root: 'w',
    positionEncoding: 'utf-16',
    flags,
    unresolvedReferences: Array.from({ length: unresolved }, () => ({
      key: null,
      range,
      provider: 'launchdarkly' as const,
      language: 'typescript' as const,
      kind: 'production-code' as const,
      resolution: 'unresolved' as const,
      expression: 'k',
    })),
    unsupportedProviders: [],
    findings: [],
  };
}

const ancient = flag('ancient', 90, [
  { kind: 'age-since-introduced', detail: 800 },
  { kind: 'time-since-last-modified', detail: 700 },
]);
const unread = flag('unread', 25, [{ kind: 'absent-from-code', detail: true }]);
const scaffold = flag('scaffold', 20, [{ kind: 'test-only-references', detail: true }]);
const young = flag('young', 3, [{ kind: 'age-since-introduced', detail: 30 }]);
const spreadOnly = flag('spread-only', 10, [{ kind: 'module-spread', detail: 2 }]);

describe('scan summary', () => {
  it('counts each debt signal from the flags own evidence', () => {
    expect(summarize(report([ancient, unread, scaffold, young], 2))).toEqual({
      flags: 4,
      olderThanAYear: 1,
      neverRead: 1,
      testOnly: 1,
      unresolved: 2,
    });
  });

  it('omits zero counts, so a clean repository has no headline', () => {
    expect(headlineParts(summarize(report([young])))).toEqual([]);
    expect(headlineParts(summarize(report([unread], 1)))).toEqual([
      '1 never read by code',
      '1 unresolved key',
    ]);
  });

  it('cannot call a flag old without git history', () => {
    expect(summarize(report([unread])).olderThanAYear).toBe(0);
  });
});

describe('debt ranking', () => {
  it('orders by score, breaking ties by key', () => {
    const tie = flag('a-tie', 25, [{ kind: 'absent-from-code', detail: true }]);
    const ranked = rankByDebt(report([scaffold, unread, ancient, tie]), 10);
    expect(ranked.map((f) => f.key)).toEqual(['ancient', 'a-tie', 'unread', 'scaffold']);
  });

  it('leaves out flags that score without any debt signal', () => {
    // Module spread raises the cost of removal, but a young flag spanning two
    // modules is not debt; ranking it would put noise at the top.
    expect(rankByDebt(report([spreadOnly, young]), 10)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(rankByDebt(report([ancient, unread, scaffold]), 2)).toHaveLength(2);
  });

  it('names the evidence behind each rank', () => {
    expect(debtReasons(ancient)).toEqual(['introduced 2.2 years ago', 'unchanged for 23 months']);
    expect(debtReasons(unread)).toEqual(['never read by code']);
    expect(debtReasons(young)).toEqual([]);
  });
});

describe('summary in the renderers', () => {
  const r = report([young, unread, ancient]);

  it('puts the headline and ranking above the terminal inventory', () => {
    const text = renderScan(r);
    const lines = text.split('\n');
    expect(lines[1]).toBe('1 older than a year · 1 never read by code');
    expect(text.indexOf('Worth reviewing first')).toBeLessThan(text.indexOf('  young'));
    expect(text).toContain('   90  ancient');
    expect(text).not.toContain('  young\n         ');
  });

  it('shows the ranking outside the fold in a pull-request comment', () => {
    const text = renderMarkdown(r);
    expect(text).toContain(
      '| `ancient` | 90 | introduced 2.2 years ago; unchanged for 23 months |',
    );
    expect(text).not.toContain('| `young`');
  });

  it('prints no ranking when nothing carries a debt signal', () => {
    expect(renderScan(report([young]))).not.toContain('Worth reviewing first');
    expect(renderMarkdown(report([young]))).not.toContain('Worth reviewing first');
  });
});

describe('helper suggestions', () => {
  function withHelpers(...names: (string | undefined)[]): ScanReport {
    const base = report([], names.length);
    return {
      ...base,
      unresolvedReferences: base.unresolvedReferences.map((ref, i) => {
        const name = names[i];
        return name === undefined ? ref : { ...ref, helperCandidate: name };
      }),
    };
  }

  it('lists each candidate once, sorted', () => {
    expect(helperCandidates(withHelpers('isOn', undefined, 'enabled', 'isOn'))).toEqual([
      'enabled',
      'isOn',
    ]);
  });

  it('gives the terminal a snippet to paste', () => {
    const text = renderScan(withHelpers('isOn'));
    expect(text).toContain('(passed through isOn)');
    expect(text).toContain('        methods: [isOn]');
    expect(text).not.toContain('If one sits inside your own flag helper');
  });

  it('falls back to general advice when no key is a pass-through', () => {
    expect(renderScan(withHelpers(undefined))).toContain('If one sits inside your own flag helper');
  });

  it('reports an unresolved-only repository in Markdown rather than calling it empty', () => {
    const text = renderMarkdown(withHelpers('isOn'));
    expect(text).not.toContain('No feature flags found');
    expect(text).toContain('1 call site computes its flag key');
    expect(text).toContain('Likely flag helpers: `isOn`');
  });
});
