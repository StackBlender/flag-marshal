import { describe, expect, it } from 'vitest';
import { applyRules, buildIndex, expectsLocalConfiguration } from '../../src/core/api/index.js';
import type {
  Confidence,
  FlagReference,
  Provider,
  ReferenceKind,
} from '../../src/core/api/index.js';

function ref(
  key: string | null,
  overrides: Partial<FlagReference> & { provider?: Provider; kind?: ReferenceKind } = {},
): FlagReference {
  return {
    key,
    range: {
      file: 'src/a.ts',
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    provider: 'launchdarkly',
    language: 'typescript',
    kind: 'production-code',
    resolution: key === null ? 'unresolved' : 'resolved',
    ...overrides,
  };
}

const run = (refs: FlagReference[], unparsed: string[] = []) =>
  applyRules({ ...buildIndex(refs), unparsedLanguages: unparsed });

const ids = (refs: FlagReference[], unparsed: string[] = []) =>
  run(refs, unparsed).map((f) => f.id);

describe('provider traits', () => {
  it.each(['launchdarkly', 'openfeature', 'unleash'] as const)(
    '%s is served remotely, so local configuration is not expected',
    (provider) => {
      expect(expectsLocalConfiguration(provider)).toBe(false);
    },
  );

  it.each(['spring-conditional', 'properties', 'environment', 'custom'] as const)(
    '%s is configured locally',
    (provider) => {
      expect(expectsLocalConfiguration(provider)).toBe(true);
    },
  );
});

describe('flag.missing-in-configuration', () => {
  it('never fires for a remotely-served provider', () => {
    // The most likely false positive in the whole product.
    expect(ids([ref('a', { provider: 'launchdarkly' })])).not.toContain(
      'flag.missing-in-configuration',
    );
  });

  it('fires for a locally-configured mechanism with no matching entry', () => {
    expect(
      ids([ref('features.x', { provider: 'spring-conditional', language: 'java' })]),
    ).toContain('flag.missing-in-configuration');
  });

  it('does not fire when configuration defines the flag', () => {
    expect(
      ids([
        ref('features.x', { provider: 'spring-conditional', language: 'java' }),
        ref('features.x', { provider: 'properties', kind: 'configuration' }),
      ]),
    ).not.toContain('flag.missing-in-configuration');
  });
});

describe('flag.absent-from-code', () => {
  const configured = [ref('features.x', { provider: 'properties', kind: 'configuration' })];

  it('fires when only configuration references the flag', () => {
    expect(ids(configured)).toContain('flag.absent-from-code');
  });

  it('claims medium confidence when the whole repository was readable', () => {
    const [finding] = run(configured);
    expect(finding?.confidence).toBe('medium');
  });

  it('drops to low when a language in the repository could not be parsed', () => {
    // "Nothing references it" may only mean "nothing this tool can read".
    const [finding] = run(configured, ['.java']);
    expect(finding?.confidence).toBe('low');
    expect(JSON.stringify(finding?.evidence)).toContain('.java');
  });

  it('drops to low when any flag key in the repository is computed', () => {
    const findings = run([...configured, ref(null)]);
    const absent = findings.find((f) => f.id === 'flag.absent-from-code');
    expect(absent?.confidence).toBe('low');
  });

  it('does not fire when code references the flag', () => {
    expect(
      ids([...configured, ref('features.x', { provider: 'spring-conditional', language: 'java' })]),
    ).not.toContain('flag.absent-from-code');
  });
});

describe('flag.test-only', () => {
  it('fires when every code reference is a test', () => {
    expect(ids([ref('a', { kind: 'test-code' })])).toContain('flag.test-only');
  });

  it('does not fire when any reference is production code', () => {
    expect(ids([ref('a', { kind: 'test-code' }), ref('a')])).not.toContain('flag.test-only');
  });

  it('ignores configuration references when deciding', () => {
    const findings = ids([
      ref('features.x', { kind: 'test-code' }),
      ref('features.x', { provider: 'properties', kind: 'configuration' }),
    ]);
    expect(findings).toContain('flag.test-only');
  });
});

describe('flag.unresolved-key', () => {
  it('reports one finding per unresolved reference at high confidence', () => {
    // Stating what could not be determined is always true. The two references
    // differ in position so deduplication does not collapse them.
    const second = {
      ...ref(null),
      range: { file: 'src/b.ts', start: { line: 9, character: 0 }, end: { line: 9, character: 1 } },
    };
    const findings = run([ref(null), second]);
    const unresolved = findings.filter((f) => f.id === 'flag.unresolved-key');
    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((f) => f.confidence === 'high')).toBe(true);
    expect(unresolved.every((f) => f.flagKey === null)).toBe(true);
  });
});

describe('rule output', () => {
  it('is empty for a workspace with no flags', () => {
    expect(run([])).toEqual([]);
  });

  it('gives every finding at least one piece of evidence', () => {
    const findings = run([
      ref('features.x', { provider: 'properties', kind: 'configuration' }),
      ref('b', { kind: 'test-code' }),
      ref(null),
    ]);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.evidence.length, `${finding.id} asserts something bare`).toBeGreaterThan(0);
    }
  });

  it('is deterministically ordered', () => {
    const refs = [
      ref('z', { kind: 'test-code' }),
      ref('a', { provider: 'properties', kind: 'configuration' }),
      ref(null),
    ];
    expect(run(refs)).toEqual(run([...refs].reverse()));
  });
});

describe('flag.stale', () => {
  const withEvidence = (
    ageDays: number,
    dormantDays: number,
    confidence: Confidence = 'medium',
  ) => ({
    flags: [
      {
        key: 'k',
        references: [ref('k')],
        inConfiguration: false,
        evidence: [
          { kind: 'age-since-introduced' as const, detail: ageDays },
          { kind: 'time-since-last-modified' as const, detail: dormantDays },
        ],
        confidence,
      },
    ],
    unresolvedReferences: [],
    unparsedLanguages: [] as string[],
  });

  it('fires for a flag that is both old and dormant', () => {
    expect(applyRules(withEvidence(400, 200)).map((f) => f.id)).toContain('flag.stale');
  });

  it('does not fire for an old flag that is still being changed', () => {
    expect(applyRules(withEvidence(400, 3)).map((f) => f.id)).not.toContain('flag.stale');
  });

  it('does not fire for a recent flag', () => {
    expect(applyRules(withEvidence(10, 10)).map((f) => f.id)).not.toContain('flag.stale');
  });

  it('never claims more confidence than the record itself has', () => {
    const [finding] = applyRules(withEvidence(400, 200, 'low'));
    expect(finding?.confidence).toBe('low');
  });

  it('carries the whole evidence trail, so nothing is asserted bare', () => {
    const [finding] = applyRules(withEvidence(400, 200));
    expect(finding?.evidence.map((e) => e.kind)).toEqual([
      'age-since-introduced',
      'time-since-last-modified',
    ]);
  });

  it('cannot fire without git history, since age is unknowable', () => {
    const input = {
      flags: [
        {
          key: 'k',
          references: [ref('k')],
          inConfiguration: false,
          evidence: [],
          confidence: 'unknown' as const,
        },
      ],
      unresolvedReferences: [],
      unparsedLanguages: [],
    };
    expect(applyRules(input).map((f) => f.id)).not.toContain('flag.stale');
  });
});

describe('operational switches are not feature-flag debt', () => {
  const springRef = (key: string) =>
    ref(key, { provider: 'spring-conditional' as const, language: 'java' as const });

  const withAge = (reference: FlagReference, confidence: Confidence = 'medium') => ({
    flags: [
      {
        key: reference.key ?? '',
        references: [reference],
        inConfiguration: true,
        evidence: [
          { kind: 'age-since-introduced' as const, detail: 900 },
          { kind: 'time-since-last-modified' as const, detail: 800 },
        ],
        confidence,
      },
    ],
    unresolvedReferences: [],
    unparsedLanguages: [] as string[],
  });

  it('never calls a Spring conditional stale, however old it is', () => {
    // @ConditionalOnProperty proves something is conditional — a queue listener,
    // a scheduled job, non-production basic auth — not that it is a temporary
    // rollout. Reporting those as stale would force a team to allowlist nearly
    // every job they run.
    const findings = applyRules(withAge(springRef('scheduledJobs.poller.enabled')));
    expect(findings.map((f) => f.id)).not.toContain('flag.stale');
  });

  it.each(['properties', 'environment'] as const)(
    'never calls a %s switch stale either',
    (provider) => {
      const reference = ref('features.x', { provider, kind: 'configuration' as const });
      expect(applyRules(withAge(reference)).map((f) => f.id)).not.toContain('flag.stale');
    },
  );

  it.each(['launchdarkly', 'unleash', 'openfeature', 'togglz'] as const)(
    'still calls an old %s flag stale',
    (provider) => {
      // You reach for a flag platform intending to remove the branch later, so
      // age is meaningful evidence there.
      const findings = applyRules(withAge(ref('rollout', { provider })));
      expect(findings.map((f) => f.id)).toContain('flag.stale');
    },
  );

  it('still reports a configured Spring property that nothing reads', () => {
    // Rules grounded in something other than age apply everywhere.
    const input = {
      flags: [
        {
          key: 'acmeco.retired',
          references: [ref('acmeco.retired', { provider: 'properties', kind: 'configuration' })],
          inConfiguration: true,
          evidence: [],
          confidence: 'medium' as const,
        },
      ],
      unresolvedReferences: [],
      unparsedLanguages: [] as string[],
    };
    expect(applyRules(input).map((f) => f.id)).toContain('flag.absent-from-code');
  });
});

describe('matchIfMissing', () => {
  const conditional = (defaultsWhenAbsent: boolean) => ({
    flags: [
      {
        key: 'q.enabled',
        references: [
          {
            ...ref('q.enabled', {
              provider: 'spring-conditional' as const,
              language: 'java' as const,
            }),
            ...(defaultsWhenAbsent ? { defaultsWhenAbsent: true } : {}),
          },
        ],
        inConfiguration: false,
        evidence: [],
        confidence: 'medium' as const,
      },
    ],
    unresolvedReferences: [],
    unparsedLanguages: [] as string[],
  });

  it('does not report missing configuration when the call site defaults', () => {
    // Spring applies its own default, so absence is normal rather than a defect.
    expect(applyRules(conditional(true)).map((f) => f.id)).not.toContain(
      'flag.missing-in-configuration',
    );
  });

  it('still reports it when the annotation declares no default', () => {
    expect(applyRules(conditional(false)).map((f) => f.id)).toContain(
      'flag.missing-in-configuration',
    );
  });
});
