import { describe, expect, it } from 'vitest';
import { moduleOf } from '../../src/core/evidence/collect.js';
import {
  collectEvidence,
  DORMANT_DAYS,
  noGitHistory,
  scoreFlag,
  STALE_AGE_DAYS,
  type Evidence,
  type FlagRecord,
  type FlagReference,
  type GitHistory,
  type Provider,
  type ReferenceKind,
} from '../../src/core/api/index.js';

const NOW = 1_800_000_000;
const DAY = 86_400;

function ref(
  file: string,
  overrides: { provider?: Provider; kind?: ReferenceKind } = {},
): FlagReference {
  return {
    key: 'k',
    range: { file, start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    provider: 'launchdarkly',
    language: 'typescript',
    kind: 'production-code',
    resolution: 'resolved',
    ...overrides,
  };
}

function record(references: FlagReference[], inConfiguration = false): FlagRecord {
  return { key: 'k', references, inConfiguration, evidence: [], confidence: 'unknown' };
}

function fakeGit(firstSeenDaysAgo: number, lastChangedDaysAgo: number): GitHistory {
  return {
    isAvailable: () => Promise.resolve(true),
    historyOf: () =>
      Promise.resolve({
        firstSeen: NOW - firstSeenDaysAgo * DAY,
        lastChanged: NOW - lastChangedDaysAgo * DAY,
      }),
    revisionsOf: () => Promise.resolve([]),
    contentAt: () => Promise.resolve(undefined),
  };
}

const kinds = (evidence: Evidence[]): string[] => evidence.map((e) => e.kind);
const value = (evidence: Evidence[], kind: string): unknown =>
  evidence.find((e) => e.kind === kind)?.detail;

describe('evidence collection', () => {
  it('counts code references, excluding configuration entries', async () => {
    const flag = record([ref('a.ts'), ref('app.properties', { kind: 'configuration' })], true);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(value(evidence, 'reference-count')).toBe(1);
  });

  it('measures module spread across top-level directories', async () => {
    const flag = record([ref('web/a.ts'), ref('service/b.ts'), ref('web/c.ts')]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(value(evidence, 'module-spread')).toBe(2);
  });

  it('records test-only usage', async () => {
    const flag = record([ref('a.test.ts', { kind: 'test-code' })]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(kinds(evidence)).toContain('test-only-references');
  });

  it('does not treat missing configuration as evidence for a remote provider', async () => {
    // A LaunchDarkly flag is served from LaunchDarkly. Recording its absence
    // from application.properties would manufacture a staleness signal out of
    // completely normal operation.
    const flag = record([ref('a.ts', { provider: 'launchdarkly' })]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(kinds(evidence)).not.toContain('absent-from-configuration');
  });

  it('does treat missing configuration as evidence for a locally-configured one', async () => {
    const flag = record([ref('A.java', { provider: 'spring-conditional' })]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(kinds(evidence)).toContain('absent-from-configuration');
  });

  it('converts git timestamps to whole days', async () => {
    const flag = record([ref('a.ts')]);
    const evidence = await collectEvidence(flag, { git: fakeGit(400, 30), now: NOW });
    expect(value(evidence, 'age-since-introduced')).toBe(400);
    expect(value(evidence, 'time-since-last-modified')).toBe(30);
  });

  it('omits history evidence entirely when git knows nothing', async () => {
    const flag = record([ref('a.ts')]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(kinds(evidence)).not.toContain('age-since-introduced');
    expect(kinds(evidence)).not.toContain('time-since-last-modified');
  });
});

const score = (evidence: Evidence[], overrides = {}) =>
  scoreFlag({
    evidence,
    unparsedLanguages: [],
    anyUnresolvedKeys: false,
    gitUnavailable: false,
    ...overrides,
  });

describe('confidence', () => {
  const old: Evidence[] = [
    { kind: 'age-since-introduced', detail: STALE_AGE_DAYS + 1 },
    { kind: 'time-since-last-modified', detail: DORMANT_DAYS + 1 },
  ];

  it('is unknown when nothing suggests staleness', () => {
    expect(score([{ kind: 'reference-count', detail: 3 }]).confidence).toBe('unknown');
  });

  it('is low for a single signal', () => {
    expect(score(old).confidence).toBe('low');
  });

  it('counts age and dormancy as one signal, not two', () => {
    // They are one observation about the same commit history. Counting them
    // twice would manufacture agreement that does not exist.
    expect(score(old).confidence).toBe('low');
  });

  it('is medium when two independent signals agree', () => {
    expect(score([...old, { kind: 'test-only-references', detail: true }]).confidence).toBe(
      'medium',
    );
  });

  it('is high when three independent signals agree', () => {
    const evidence: Evidence[] = [
      ...old,
      { kind: 'absent-from-code', detail: true },
      { kind: 'absent-from-configuration', detail: true },
    ];
    expect(score(evidence).confidence).toBe('high');
  });

  it('never reaches high when a language could not be read', () => {
    const evidence: Evidence[] = [
      ...old,
      { kind: 'absent-from-code', detail: true },
      { kind: 'absent-from-configuration', detail: true },
    ];
    expect(score(evidence, { unparsedLanguages: ['.java'] }).confidence).toBe('low');
  });

  it('never reaches high when some flag key is computed', () => {
    const evidence: Evidence[] = [
      ...old,
      { kind: 'absent-from-code', detail: true },
      { kind: 'absent-from-configuration', detail: true },
    ];
    expect(score(evidence, { anyUnresolvedKeys: true }).confidence).toBe('low');
  });

  it('caps at medium without git history', () => {
    const evidence: Evidence[] = [
      { kind: 'absent-from-code', detail: true },
      { kind: 'absent-from-configuration', detail: true },
    ];
    expect(score(evidence, { gitUnavailable: true }).confidence).toBe('medium');
  });

  it('ignores age evidence when git was unavailable', () => {
    expect(score(old, { gitUnavailable: true }).confidence).toBe('unknown');
  });
});

describe('debt score', () => {
  it('is zero for a flag with nothing against it', () => {
    expect(score([{ kind: 'reference-count', detail: 2 }]).debtScore).toBe(0);
  });

  it('rises with age', () => {
    const young = score([{ kind: 'age-since-introduced', detail: 30 }]).debtScore;
    const old = score([{ kind: 'age-since-introduced', detail: 900 }]).debtScore;
    expect(old).toBeGreaterThan(young);
  });

  it('rises when nothing in code references the flag', () => {
    expect(score([{ kind: 'absent-from-code', detail: true }]).debtScore).toBeGreaterThan(0);
  });

  it('treats wide reach as reducing urgency, not increasing it', () => {
    // A flag in fifty places is expensive to remove but is not more likely to
    // be dead. Urgency and difficulty are different axes.
    const narrow = score([
      { kind: 'age-since-introduced', detail: 900 },
      { kind: 'reference-count', detail: 1 },
    ]).debtScore;
    const wide = score([
      { kind: 'age-since-introduced', detail: 900 },
      { kind: 'reference-count', detail: 40 },
    ]).debtScore;
    expect(wide).toBeLessThan(narrow);
  });

  it('stays within 0 and 100', () => {
    const extreme: Evidence[] = [
      { kind: 'age-since-introduced', detail: 100_000 },
      { kind: 'time-since-last-modified', detail: 100_000 },
      { kind: 'module-spread', detail: 50 },
      { kind: 'test-only-references', detail: true },
      { kind: 'absent-from-code', detail: true },
    ];
    const result = score(extreme).debtScore;
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe('module spread on conventional layouts', () => {
  it('sees packages, not the shared src prefix', async () => {
    // Under Maven and Gradle every file starts src/main/java, so a first-segment
    // rule reported spread 1 for a flag touching the entire codebase.
    const flag = record([
      ref('src/main/java/com/example/billing/Service.java'),
      ref('src/main/java/com/example/search/Worker.java'),
      ref('src/main/java/com/example/billing/Other.java'),
    ]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(value(evidence, 'module-spread')).toBe(2);
  });

  it('still distinguishes top-level modules in a monorepo', async () => {
    const flag = record([ref('web/src/a.ts'), ref('service/src/main/java/com/example/B.java')]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(value(evidence, 'module-spread')).toBe(2);
  });

  it('treats one package as one module however deep it is', async () => {
    const flag = record([
      ref('src/main/kotlin/com/example/a/A.kt'),
      ref('src/main/kotlin/com/example/a/B.kt'),
    ]);
    const evidence = await collectEvidence(flag, { git: noGitHistory, now: NOW });
    expect(value(evidence, 'module-spread')).toBe(1);
  });

  it('counts main and test sources of one package as one module', () => {
    // src/main/java/com/x and src/test/java/com/x are the same part of the system.
    expect(moduleOf('src/main/java/com/x/A.java')).toBe(moduleOf('src/test/java/com/x/ATest.java'));
  });
});
