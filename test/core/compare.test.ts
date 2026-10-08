import { describe, expect, it } from 'vitest';
import {
  compareReports,
  type Finding,
  type FlagRecord,
  type FlagReference,
  type ScanReport,
} from '../../src/core/api/index.js';

const SINCE = { ref: 'origin/main', commit: 'abc123' };

function ref(file: string, line: number, key: string | null, expression?: string): FlagReference {
  return {
    key,
    resolution: key === null ? 'unresolved' : 'resolved',
    provider: 'launchdarkly',
    language: 'typescript',
    kind: 'production-code',
    range: {
      file,
      start: { line, character: 0 },
      end: { line, character: 1 },
    },
    ...(expression === undefined ? {} : { expression }),
  };
}

function flag(key: string, references: number): FlagRecord {
  return {
    key,
    references: Array.from({ length: references }, (_, i) => ref('src/a.ts', i, key)),
  } as FlagRecord;
}

function finding(id: Finding['id'], flagKey: string | null, line = 0): Finding {
  return {
    id,
    flagKey,
    severity: 'warning',
    confidence: 'high',
    evidence: [],
    range: { file: 'src/a.ts', start: { line, character: 0 }, end: { line, character: 1 } },
  } as Finding;
}

function report(parts: Partial<ScanReport>): ScanReport {
  return {
    schemaVersion: '1.0',
    tool: { name: 'flag-marshal', coreVersion: '0.0.0' },
    root: '/w',
    positionEncoding: 'utf-16',
    flags: [],
    unresolvedReferences: [],
    findings: [],
    ...parts,
  };
}

describe('compareReports', () => {
  it('reports nothing for identical reports', () => {
    const same = report({
      flags: [flag('a', 2)],
      findings: [finding('flag.missing-owner', 'a')],
      unresolvedReferences: [ref('src/a.ts', 3, null, 'k')],
    });
    expect(compareReports(same, same, SINCE)).toEqual({
      since: SINCE,
      addedFlags: [],
      removedFlags: [],
      changedFlags: [],
      introducedFindings: [],
      resolvedFindings: [],
      introducedUnresolved: [],
      resolvedUnresolved: [],
    });
  });

  it('matches flags by key, sorted, and counts reference changes', () => {
    const base = report({ flags: [flag('zeta', 1), flag('legacy', 1), flag('kept', 1)] });
    const head = report({ flags: [flag('kept', 3), flag('beta', 1), flag('alpha', 1)] });
    const changes = compareReports(base, head, SINCE);

    expect(changes.addedFlags).toEqual(['alpha', 'beta']);
    expect(changes.removedFlags).toEqual(['legacy', 'zeta']);
    expect(changes.changedFlags).toEqual([
      { key: 'kept', referencesBefore: 1, referencesAfter: 3 },
    ]);
  });

  it('ignores where a finding is, so moved code is not a change', () => {
    const base = report({ findings: [finding('flag.missing-owner', 'a', 1)] });
    const head = report({ findings: [finding('flag.missing-owner', 'a', 40)] });
    const changes = compareReports(base, head, SINCE);

    expect(changes.introducedFindings).toEqual([]);
    expect(changes.resolvedFindings).toEqual([]);
  });

  it('reports introduced and resolved findings, keeping their own positions', () => {
    const fixed = finding('flag.missing-owner', 'old', 5);
    const added = finding('flag.missing-owner', 'new', 9);
    const changes = compareReports(
      report({ findings: [fixed] }),
      report({ findings: [added] }),
      SINCE,
    );

    expect(changes.introducedFindings).toEqual([added]);
    expect(changes.resolvedFindings).toEqual([fixed]);
  });

  it('counts alike unresolved references, so a second computed key is new', () => {
    const one = ref('src/a.ts', 3, null, 'k');
    const two = ref('src/a.ts', 8, null, 'k');
    const changes = compareReports(
      report({ unresolvedReferences: [one] }),
      report({ unresolvedReferences: [one, two] }),
      SINCE,
    );

    expect(changes.introducedUnresolved).toHaveLength(1);
    expect(changes.resolvedUnresolved).toEqual([]);
  });

  it('treats an unresolved reference moving to another file as a change', () => {
    const before = ref('src/a.ts', 3, null, 'k');
    const after = ref('src/b.ts', 3, null, 'k');
    const changes = compareReports(
      report({ unresolvedReferences: [before] }),
      report({ unresolvedReferences: [after] }),
      SINCE,
    );

    expect(changes.introducedUnresolved).toEqual([after]);
    expect(changes.resolvedUnresolved).toEqual([before]);
  });

  it('treats a budget breach as one violation however its count moves', () => {
    const base = report({ findings: [finding('flag.budget-exceeded', null)] });
    const head = report({ findings: [finding('flag.budget-exceeded', null)] });
    expect(compareReports(base, head, SINCE).introducedFindings).toEqual([]);
    expect(compareReports(report({}), head, SINCE).introducedFindings).toHaveLength(1);
  });
});
