import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Finding, FlagRecord, ScanReport } from '../../src/core/api/index.js';
import {
  arrangeFlags,
  AUTO_RESCAN_BUDGET_MS,
  shouldAutoRescan,
  toDiagnostics,
  toInventory,
} from '../../src/frontends/vscode/model.js';

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'fixtures');

const golden = (name: string): ScanReport =>
  JSON.parse(readFileSync(resolve(FIXTURES, name, 'expected.json'), 'utf8')) as ScanReport;

const goldenNames = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    try {
      golden(name);
      return true;
    } catch {
      return false;
    }
  });

const at = (file: string, line: number) => ({
  file,
  start: { line, character: 2 },
  end: { line, character: 8 },
});

const reference = (
  file: string,
  line: number,
  kind: FlagRecord['references'][number]['kind'] = 'production-code',
) => ({
  key: 'alpha',
  range: at(file, line),
  provider: 'launchdarkly' as const,
  language: 'typescript' as const,
  kind,
  resolution: 'resolved' as const,
});

const flagRecord = (
  key: string,
  references: FlagRecord['references'],
  inConfiguration = true,
): FlagRecord => ({ key, inConfiguration, references, evidence: [], confidence: 'high' });

function report(flags: FlagRecord[], findings: Finding[]): ScanReport {
  return {
    schemaVersion: '1.0',
    tool: { name: 'flag-marshal', coreVersion: '0.0.0' },
    root: '/w',
    positionEncoding: 'utf-16',
    flags,
    unresolvedReferences: [],
    unsupportedProviders: [],
    findings,
  };
}

const expired: Finding = {
  id: 'flag.expired',
  flagKey: 'alpha',
  severity: 'error',
  confidence: 'high',
  evidence: [
    { kind: 'declared-expiry', detail: '2025-01-01' },
    { kind: 'age-since-introduced', detail: 400 },
  ],
};

describe('the VS Code diagnostic model', () => {
  it('shows a flag-level finding at every reference, not just the first', () => {
    // A developer opening the second file must learn the flag is overdue. Pinning
    // the warning to one arbitrary reference makes it invisible everywhere else,
    // which is indistinguishable from not reporting it.
    const flag: FlagRecord = flagRecord('alpha', [
      reference('src/a.ts', 4),
      reference('src/b.ts', 9),
    ]);
    const { byFile, workspace } = toDiagnostics(report([flag], [expired]));

    expect([...byFile.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(byFile.get('src/b.ts')?.[0]?.range.start.line).toBe(9);
    expect(workspace).toEqual([]);
  });

  it('keeps a finding that carries its own range at that range', () => {
    const finding: Finding = {
      ...expired,
      id: 'flag.absent-from-code',
      range: at('config/app.yml', 2),
    };
    const { byFile } = toDiagnostics(report([], [finding]));

    expect(byFile.get('config/app.yml')).toHaveLength(1);
    expect(byFile.size).toBe(1);
  });

  it('keeps a workspace finding rather than dropping it', () => {
    // A budget breach names no flag and no file, so there is nothing to underline.
    // It is also the one finding a team explicitly agreed to enforce.
    const budget: Finding = {
      id: 'flag.budget-exceeded',
      flagKey: null,
      severity: 'error',
      confidence: 'high',
      evidence: [
        { kind: 'flag-count', detail: 42 },
        { kind: 'budget', detail: 10 },
      ],
    };
    const { byFile, workspace } = toDiagnostics(report([], [budget]));

    expect(byFile.size).toBe(0);
    expect(workspace).toHaveLength(1);
    expect(workspace[0]?.message).toContain('42');
  });

  it('does not repeat an unresolved-key finding across a flag it does not describe', () => {
    const flag: FlagRecord = flagRecord('alpha', [
      reference('src/a.ts', 4),
      reference('src/b.ts', 9),
    ]);
    const finding: Finding = {
      id: 'flag.unresolved-key',
      flagKey: 'alpha',
      severity: 'info',
      confidence: 'high',
      evidence: [],
    };
    const { byFile, workspace } = toDiagnostics(report([flag], [finding]));

    expect(byFile.size).toBe(0);
    expect(workspace).toHaveLength(1);
  });

  it('separates the conclusion from the evidence that produced it', () => {
    // The split is for the host to arrange, not to let it drop half. A frontend
    // that renders only `message` shows a claim with nothing behind it; see the
    // extension-host test that asserts both reach the rendered diagnostic.
    const flag: FlagRecord = flagRecord('alpha', [reference('src/a.ts', 4)]);
    const diagnostic = toDiagnostics(report([flag], [expired])).byFile.get('src/a.ts')?.[0];

    expect(diagnostic?.message).not.toContain('Why:');
    expect(diagnostic?.detail).toContain('Why:');
    expect(diagnostic?.detail).toContain('Confidence: high');
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.source).toBe('Flag Marshal');
  });

  it('maps info to VS Code information, which has a different name', () => {
    const finding: Finding = { ...expired, severity: 'info', range: at('src/a.ts', 1) };
    expect(toDiagnostics(report([], [finding])).byFile.get('src/a.ts')?.[0]?.severity).toBe(
      'information',
    );
  });

  it('authors no wording of its own: every message comes from the catalog', () => {
    const flag: FlagRecord = flagRecord('alpha', [reference('src/a.ts', 4)]);
    const diagnostic = toDiagnostics(report([flag], [expired])).byFile.get('src/a.ts')?.[0];

    // Catalog messages are filled, never left with a literal placeholder.
    expect(diagnostic?.message).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(diagnostic?.detail).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});

describe('the VS Code inventory model', () => {
  it('sorts by key so the tree does not reshuffle between scans', () => {
    const flags = ['zeta', 'alpha', 'mu'].map((key) => flagRecord(key, [reference('src/a.ts', 1)]));
    expect(toInventory(report(flags, [])).flags.map((f) => f.key)).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('describes a test-only, unconfigured flag in the terms the CLI uses', () => {
    const flags: FlagRecord[] = [
      flagRecord('alpha', [reference('test/a.spec.ts', 3, 'test-code')], false),
    ];
    const flag = toInventory(report(flags, [])).flags[0];

    expect(flag?.description).toBe('1 reference · test code only · not in configuration');
    expect(flag?.testOnly).toBe(true);
  });

  it('labels references one-based, as the gutter does', () => {
    const flags = [flagRecord('alpha', [reference('src/a.ts', 4)])];
    expect(toInventory(report(flags, [])).flags[0]?.references[0]?.label).toBe('src/a.ts:5');
  });

  it('states an unsupported platform instead of silently omitting it', () => {
    // An inventory that quietly drops a whole flag platform is a confident wrong
    // answer, which is the failure this product cannot afford.
    const base = report([], []);
    const withUnsupported: ScanReport = {
      ...base,
      unsupportedProviders: [
        {
          name: 'Togglz',
          evidence: 'import org.togglz.core.Feature',
          files: ['src/Features.java'],
        },
      ],
    };
    const { unsupported } = toInventory(withUnsupported);

    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]?.name).toBe('Togglz');
    expect(unsupported[0]?.description).toContain('src/Features.java');
  });

  it('badges a flag with the findings that concern it', () => {
    const flags = [flagRecord('alpha', [reference('src/a.ts', 4)])];
    expect(toInventory(report(flags, [expired])).flags[0]?.findings).toEqual(['flag.expired']);
  });
});

/**
 * The conformance requirement from Milestone 10: the extension renders the golden
 * set. Goldens pin detection, so this asserts the view model reproduces exactly
 * what was detected — no flag invented, none dropped, no reference lost.
 */
describe('golden conformance', () => {
  it('has goldens to check', () => {
    expect(goldenNames.length).toBeGreaterThan(0);
  });

  it.each(goldenNames)('renders the %s golden without inventing or losing a flag', (name) => {
    const report = golden(name);
    const inventory = toInventory(report);

    expect(inventory.flags.map((f) => f.key).sort()).toEqual(report.flags.map((f) => f.key).sort());
    expect(inventory.flags.reduce((n, f) => n + f.references.length, 0)).toBe(
      report.flags.reduce((n, f) => n + f.references.length, 0),
    );
    expect(inventory.unresolved).toHaveLength(report.unresolvedReferences.length);
  });

  it.each(goldenNames)('renders every %s finding somewhere a user can see it', (name) => {
    const report = golden(name);
    const { byFile, workspace } = toDiagnostics(report);
    const shown = [...byFile.values()].flat().length + workspace.length;

    // Never fewer than the findings: a finding with no home is a finding nobody
    // reads. It may be more, because a flag-level finding repeats per reference.
    expect(shown).toBeGreaterThanOrEqual(report.findings.length);
  });
});

describe('the auto-rescan budget', () => {
  it('always allows the first scan', () => {
    expect(shouldAutoRescan(undefined)).toBe(true);
  });

  it('keeps rescanning a workspace it can scan quickly', () => {
    expect(shouldAutoRescan(120)).toBe(true);
    expect(shouldAutoRescan(AUTO_RESCAN_BUDGET_MS)).toBe(true);
  });

  it('stops rescanning one it cannot', () => {
    // Spring Boot's repository takes about 55 seconds in this engine. Re-running
    // that after every save would keep a core busy for the afternoon, and the user
    // would experience it as an editor that stutters for no stated reason.
    expect(shouldAutoRescan(55_000)).toBe(false);
    expect(shouldAutoRescan(AUTO_RESCAN_BUDGET_MS + 1)).toBe(false);
  });
});

describe('debt order in the VS Code inventory', () => {
  const scored = (
    key: string,
    debtScore: number,
    evidence: FlagRecord['evidence'],
  ): FlagRecord => ({
    ...flagRecord(key, [reference('src/a.ts', 1)]),
    evidence,
    debtScore,
  });
  const flags = [
    scored('young', 10, [{ kind: 'module-spread', detail: 2 }]),
    scored('unread', 25, [{ kind: 'absent-from-code', detail: true }]),
    scored('ancient', 90, [{ kind: 'age-since-introduced', detail: 800 }]),
    scored('alpha', 0, []),
  ];
  const inventory = toInventory(report(flags, []));

  it('ranks flags with a debt reason first, as the CLI does, then the rest by key', () => {
    expect(arrangeFlags(inventory.flags, 'debt').map((f) => f.key)).toEqual([
      'ancient',
      'unread',
      'alpha',
      'young',
    ]);
  });

  it('keeps name order available and stable', () => {
    expect(arrangeFlags(inventory.flags, 'name').map((f) => f.key)).toEqual([
      'alpha',
      'ancient',
      'unread',
      'young',
    ]);
  });

  it('shows a score only beside its reasons', () => {
    const byKey = new Map(inventory.flags.map((f) => [f.key, f]));
    expect(byKey.get('ancient')?.description).toBe('debt 90 · 1 reference');
    expect(byKey.get('ancient')?.tooltip).toBe('ancient — debt score 90\nintroduced 2.2 years ago');
    // Spread alone scores but is not debt, so no score is shown for it.
    expect(byKey.get('young')?.description).toBe('1 reference');
    expect(byKey.get('young')?.tooltip).toBe('young');
  });

  it('names a helper to declare when a computed key passes through one', () => {
    const base = report([], []);
    const unresolved = {
      ...reference('src/flags.ts', 3),
      key: null,
      resolution: 'unresolved' as const,
      expression: 'key',
    };
    expect(toInventory({ ...base, unresolvedReferences: [unresolved] }).unresolvedDescription).toBe(
      'read from a variable, not reported as a flag',
    );
    expect(
      toInventory({
        ...base,
        unresolvedReferences: [{ ...unresolved, helperCandidate: 'isOn' }],
      }).unresolvedDescription,
    ).toBe('passed through isOn: declare in customPatterns.methods');
  });
});
