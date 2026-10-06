import { describe, expect, it } from 'vitest';
import {
  applyRatchet,
  DEFAULT_POLICY,
  evaluatePolicy,
  makeBaseline,
  readInlineMetadata,
  violationKey,
  type Finding,
  type FlagMetadata,
  type FlagRecord,
  type Policy,
} from '../../src/core/api/index.js';

const NOW = Date.parse('2026-06-01T00:00:00Z') / 1000;

function flag(key: string): FlagRecord {
  return {
    key,
    references: [
      {
        key,
        range: {
          file: 'src/a.ts',
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'resolved',
      },
    ],
    inConfiguration: false,
    evidence: [],
    confidence: 'unknown',
  };
}

const evaluate = (
  keys: string[],
  policy: Partial<Policy> = {},
  metadata: Record<string, FlagMetadata> = {},
): Finding[] =>
  evaluatePolicy({
    flags: keys.map(flag),
    policy: { ...DEFAULT_POLICY, ...policy },
    metadata,
    now: NOW,
  });

const ids = (findings: Finding[]) => findings.map((f) => f.id);

describe('policy evaluation', () => {
  it('does nothing when no policy is configured', () => {
    expect(evaluate(['a', 'b'])).toEqual([]);
  });

  it('requires an owner when asked', () => {
    expect(ids(evaluate(['a'], { requireOwner: true }))).toEqual(['flag.missing-owner']);
  });

  it('accepts a declared owner', () => {
    const findings = evaluate(['a'], { requireOwner: true }, { a: { owner: 'team-x' } });
    expect(findings).toEqual([]);
  });

  it('requires an expiry when asked', () => {
    expect(ids(evaluate(['a'], { requireExpiry: true }))).toEqual(['flag.missing-expiry']);
  });

  it('reports a passed expiry date', () => {
    const findings = evaluate(['a'], {}, { a: { expiry: '2025-01-01' } });
    expect(ids(findings)).toEqual(['flag.expired']);
    expect(findings[0]?.evidence.map((e) => e.detail)).toContain('2025-01-01');
  });

  it('says nothing about an expiry still in the future', () => {
    expect(evaluate(['a'], {}, { a: { expiry: '2030-01-01' } })).toEqual([]);
  });

  it('exempts allowlisted flags entirely', () => {
    // Kill switches legitimately live forever. A tool that cannot say so gets
    // switched off.
    const policy = { requireOwner: true, requireExpiry: true, allowlist: ['kill-switch'] };
    expect(evaluate(['kill-switch'], policy)).toEqual([]);
    expect(ids(evaluate(['other'], policy))).toContain('flag.missing-owner');
  });

  it('raises a budget violation only when the budget is exceeded', () => {
    expect(ids(evaluate(['a', 'b'], { budget: 2 }))).toEqual([]);
    expect(ids(evaluate(['a', 'b', 'c'], { budget: 2 }))).toEqual(['flag.budget-exceeded']);
  });

  it('excludes allowlisted flags from the budget count', () => {
    const policy = { budget: 2, allowlist: ['kill-switch'] };
    expect(evaluate(['a', 'b', 'kill-switch'], policy)).toEqual([]);
  });

  it('reports every policy finding at high confidence', () => {
    // A policy finding is a fact about the repository, not an inference: the
    // team either declared an owner or did not.
    const findings = evaluate(['a'], { requireOwner: true, requireExpiry: true });
    expect(findings.every((f) => f.confidence === 'high')).toBe(true);
  });

  it('is deterministically ordered', () => {
    const policy = { requireOwner: true, requireExpiry: true };
    expect(evaluate(['z', 'a'], policy)).toEqual(evaluate(['a', 'z'], policy));
  });
});

describe('violation identity', () => {
  it('ignores file position, so moving a flag is not a new violation', () => {
    // A baseline that churned on every refactor would be abandoned in a week.
    const [a] = evaluate(['a'], { requireOwner: true });
    const moved: Finding = {
      ...a!,
      range: {
        file: 'src/b.ts',
        start: { line: 99, character: 0 },
        end: { line: 99, character: 1 },
      },
    };
    expect(violationKey(moved)).toBe(violationKey(a!));
  });
});

describe('the baseline ratchet', () => {
  const violations = evaluate(['a', 'b'], { requireOwner: true });

  it('treats everything as new when no baseline exists', () => {
    const result = applyRatchet(violations, undefined);
    expect(result.introduced).toHaveLength(2);
    expect(result.accepted).toEqual([]);
  });

  it('accepts pre-existing debt so first adoption passes', () => {
    const result = applyRatchet(violations, makeBaseline(violations));
    expect(result.introduced).toEqual([]);
    expect(result.accepted).toHaveLength(2);
  });

  it('fails only on violations that are genuinely new', () => {
    const baseline = makeBaseline(evaluate(['a'], { requireOwner: true }));
    const result = applyRatchet(violations, baseline);
    expect(result.introduced.map((f) => f.flagKey)).toEqual(['b']);
    expect(result.accepted.map((f) => f.flagKey)).toEqual(['a']);
  });

  it('reports baselined violations that no longer occur', () => {
    const baseline = makeBaseline(evaluate(['a', 'b', 'gone'], { requireOwner: true }));
    const result = applyRatchet(violations, baseline);
    expect(result.resolved).toEqual(['flag.missing-owner:gone']);
  });

  it('produces a sorted, deduplicated baseline', () => {
    const baseline = makeBaseline([...violations, ...violations]);
    expect(baseline.accepted).toEqual([...new Set(baseline.accepted)].sort());
  });
});

describe('inline metadata directives', () => {
  const read = (text: string) => readInlineMetadata('src/a.ts', text);

  it('reads owner and expiry', () => {
    const { metadata } = read('// flag-marshal: alpha owner=team-a expiry=2027-01-01');
    expect(metadata['alpha']).toEqual({ owner: 'team-a', expiry: '2027-01-01' });
  });

  it('works with any comment syntax, because it only reads the directive text', () => {
    for (const comment of ['//', '#', '--', '/*']) {
      const { metadata } = read(`${comment} flag-marshal: alpha owner=team-a`);
      expect(metadata['alpha']?.owner, comment).toBe('team-a');
    }
  });

  it('names the flag explicitly rather than inferring it from proximity', () => {
    // Proximity breaks the moment someone reformats a file.
    const { metadata } = read(
      ['// flag-marshal: alpha owner=team-a', '', '', "c.variation('beta', u, false);"].join('\n'),
    );
    expect(Object.keys(metadata)).toEqual(['alpha']);
  });

  it('rejects a malformed expiry and says so', () => {
    const { metadata, problems } = read('// flag-marshal: alpha expiry=next-tuesday');
    expect(metadata['alpha']?.expiry).toBeUndefined();
    expect(problems[0]).toContain('YYYY-MM-DD');
  });

  it('reports an unknown attribute', () => {
    const { problems } = read('// flag-marshal: alpha wat=1');
    expect(problems[0]).toContain("unknown attribute 'wat'");
  });

  it('returns nothing for a file with no directive', () => {
    expect(read('const a = 1;').metadata).toEqual({});
  });
});
