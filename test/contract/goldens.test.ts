import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import type { ScanReport } from '../../src/core/api/index.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURES = resolve(ROOT, 'fixtures');

const schema = JSON.parse(
  readFileSync(resolve(ROOT, 'schema/v1/scan-report.schema.json'), 'utf8'),
) as object;

const validate: ValidateFunction = new Ajv2020({
  strict: true,
  allowUnionTypes: true,
  allErrors: true,
}).compile(schema);

const fixtures = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const golden = (name: string): ScanReport =>
  JSON.parse(readFileSync(resolve(FIXTURES, name, 'expected.json'), 'utf8')) as ScanReport;

describe('fixture corpus', () => {
  it('contains the eight documented fixtures', () => {
    expect(fixtures).toEqual([
      'computed-keys',
      'java-spring-conditional',
      'java-togglz',
      'kotlin-unleash',
      'mixed-polyglot',
      'no-flags',
      'real-world-shapes',
      'ts-launchdarkly',
    ]);
  });

  it.each(fixtures)('%s documents itself and ships a golden', (name) => {
    expect(existsSync(resolve(FIXTURES, name, 'README.md')), 'README.md').toBe(true);
    expect(existsSync(resolve(FIXTURES, name, 'expected.json')), 'expected.json').toBe(true);
  });
});

describe('goldens conform to the wire contract', () => {
  it.each(fixtures)('%s validates against schema/v1', (name) => {
    const valid = validate(golden(name));
    expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 2)).toEqual([]);
    expect(valid).toBe(true);
  });

  it.each(fixtures)('%s stores a machine-independent root', (name) => {
    // Absolute paths would make goldens differ per machine and per CI runner.
    expect(golden(name).root).toBe(name);
  });

  it.each(fixtures)('%s lists flags in deterministic key order', (name) => {
    const keys = golden(name).flags.map((f) => f.key);
    expect(keys).toEqual([...keys].sort());
  });

  it.each(fixtures)('%s gives every reference a non-empty relative path', (name) => {
    const report = golden(name);
    const all = [...report.flags.flatMap((f) => f.references), ...report.unresolvedReferences];
    for (const ref of all) {
      expect(ref.range.file).not.toBe('');
      expect(ref.range.file.startsWith('/'), 'paths are relative to the workspace root').toBe(
        false,
      );
      expect(ref.range.file).not.toContain('\\');
    }
  });

  it.each(fixtures)('%s never carries a resolved reference without a key', (name) => {
    const report = golden(name);
    for (const flag of report.flags) {
      for (const ref of flag.references) {
        expect(ref.resolution).toBe('resolved');
        expect(ref.key).toBe(flag.key);
      }
    }
  });
});

describe('the fixtures that guard against false positives', () => {
  it('no-flags reports nothing at all', () => {
    const report = golden('no-flags');
    expect(report.flags).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.unresolvedReferences).toEqual([]);
  });

  it('computed-keys resolves only the literal and never guesses the rest', () => {
    const report = golden('computed-keys');
    expect(report.flags.map((f) => f.key)).toEqual(['audit-log']);
    expect(report.unresolvedReferences).toHaveLength(2);
    for (const ref of report.unresolvedReferences) {
      expect(ref.key, 'an unresolved reference must not carry an invented key').toBeNull();
      expect(ref.resolution).toBe('unresolved');
      expect(ref.expression, 'keep the source text so a human can see why').toBeTruthy();
    }
  });

  it('mixed-polyglot merges one key across two languages into one record', () => {
    const report = golden('mixed-polyglot');
    expect(report.flags).toHaveLength(1);
    const [flag] = report.flags;
    expect(flag?.key).toBe('unified-billing');
    expect(flag?.references.map((r) => r.language).sort()).toEqual(['java', 'typescript']);
  });

  it('java-spring-conditional keeps a configured-but-unreferenced flag', () => {
    const report = golden('java-spring-conditional');
    const retired = report.flags.find((f) => f.key === 'features.retired-dashboard');
    expect(retired, 'the configuration-only flag is the point of this fixture').toBeDefined();
    expect(retired?.references.every((r) => r.kind === 'configuration')).toBe(true);
  });
});

describe('goldens pin detection, not scoring', () => {
  it.each(fixtures)('%s records no evidence or debt score', (name) => {
    // Evidence and scoring depend on commit history and on which languages the
    // running build can read, so freezing them here would make every golden go
    // stale on the next commit. Scoring is asserted by unit tests instead; these
    // files stay the contract for *what was detected and where*.
    const report = golden(name);
    for (const flag of report.flags) {
      expect(flag.evidence).toEqual([]);
      expect(flag.confidence).toBe('unknown');
      expect(flag.debtScore).toBeUndefined();
    }
  });
});

describe('golden findings', () => {
  it.each(fixtures)('%s gives every finding evidence and a confidence', (name) => {
    for (const finding of golden(name).findings) {
      expect(finding.evidence.length, `${finding.id} asserts something bare`).toBeGreaterThan(0);
      expect(finding.confidence).toBeDefined();
    }
  });

  it('never claims a flag is stale before Milestone 5 implements it', () => {
    for (const name of fixtures) {
      expect(golden(name).findings.map((f) => f.id)).not.toContain('flag.stale');
    }
  });

  it('raises no configuration finding for a remotely-served provider', () => {
    // A LaunchDarkly flag lives in LaunchDarkly, not in application.properties.
    // Reporting every remote flag as unconfigured would fire on every flag in a
    // repository — the single most likely way to get uninstalled on first run.
    for (const name of ['ts-launchdarkly', 'mixed-polyglot', 'kotlin-unleash']) {
      const ids = golden(name).findings.map((f) => f.id);
      expect(ids, name).not.toContain('flag.missing-in-configuration');
    }
  });
});
