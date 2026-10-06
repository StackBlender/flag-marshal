import { describe, expect, it } from 'vitest';
import { messageCatalog, type Finding } from '../../src/core/api/index.js';
import { renderScan } from '../../src/frontends/cli/render.js';

const range = {
  file: 'src/a.ts',
  start: { line: 4, character: 2 },
  end: { line: 4, character: 8 },
};

function report(findings: Finding[]) {
  return {
    schemaVersion: '1.0' as const,
    tool: { name: 'flag-marshal' as const, coreVersion: '0.0.0' },
    root: '/w',
    positionEncoding: 'utf-16' as const,
    flags: [],
    unresolvedReferences: [],
    unsupportedProviders: [],
    findings,
  };
}

/**
 * Every placeholder a catalog message declares must actually be filled. A
 * literal `{count}` reaching a user is the visible symptom of a message and its
 * evidence drifting apart, which is exactly what the catalog exists to prevent.
 */
describe('message rendering', () => {
  const cases: Finding[] = [
    {
      id: 'flag.budget-exceeded',
      flagKey: null,
      severity: 'error',
      confidence: 'high',
      evidence: [
        { kind: 'flag-count', detail: 42 },
        { kind: 'budget', detail: 10 },
      ],
    },
    {
      id: 'flag.expired',
      flagKey: 'alpha',
      severity: 'error',
      confidence: 'high',
      evidence: [
        { kind: 'declared-expiry', detail: '2025-01-01' },
        { kind: 'age-since-introduced', detail: 400 },
      ],
      range,
    },
    {
      id: 'flag.missing-owner',
      flagKey: 'beta',
      severity: 'error',
      confidence: 'high',
      evidence: [{ kind: 'declared-owner', detail: false }],
      range,
    },
    {
      id: 'flag.missing-expiry',
      flagKey: 'beta',
      severity: 'error',
      confidence: 'high',
      evidence: [{ kind: 'declared-expiry', detail: false }],
      range,
    },
    {
      id: 'flag.missing-in-configuration',
      flagKey: 'delta',
      severity: 'warning',
      confidence: 'medium',
      evidence: [
        { kind: 'absent-from-configuration', detail: true },
        { kind: 'reference-count', detail: 1 },
      ],
      range,
    },
    {
      id: 'flag.absent-from-code',
      flagKey: 'epsilon',
      severity: 'warning',
      confidence: 'medium',
      evidence: [
        { kind: 'absent-from-code', detail: true },
        { kind: 'reference-count', detail: 0 },
      ],
      range,
    },
    {
      id: 'flag.test-only',
      flagKey: 'zeta',
      severity: 'info',
      confidence: 'medium',
      evidence: [
        { kind: 'test-only-references', detail: true },
        { kind: 'reference-count', detail: 2 },
      ],
      range,
    },
    {
      id: 'flag.stale',
      flagKey: 'gamma',
      severity: 'warning',
      confidence: 'medium',
      evidence: [
        { kind: 'age-since-introduced', detail: 500 },
        { kind: 'reference-count', detail: 2 },
      ],
      range,
    },
  ];

  it.each(cases)('leaves no unsubstituted placeholder in $id', (finding) => {
    const text = renderScan(report([finding]));
    expect(text, `a literal placeholder reached the user in ${finding.id}`).not.toMatch(/\{\w+\}/);
  });

  it('covers every catalog message with a case here', () => {
    // A new finding id with no rendering case is a placeholder bug waiting to
    // ship, so adding one must fail this test until a case is added.
    const covered = new Set(cases.map((c) => c.id));
    covered.add('flag.unresolved-key'); // Rendered in its own section, not as a finding.
    const missing = Object.keys(messageCatalog).filter((id) => !covered.has(id as Finding['id']));
    expect(missing).toEqual([]);
  });

  it('prints line numbers 1-based for humans', () => {
    expect(renderScan(report([cases[1]!]))).toContain('src/a.ts:5');
  });
});
