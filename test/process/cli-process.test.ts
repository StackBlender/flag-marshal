import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORE_VERSION, type ScanReport } from '../../src/core/api/index.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ENTRY = resolve(ROOT, 'dist/frontends/cli/main.js');

/**
 * These invoke the real built CLI as a subprocess. Unit tests exercise the
 * engine; only this proves the artifact a user actually runs behaves the same —
 * including grammar loading from `dist/`, which resolves differently than from
 * source.
 */
function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [ENTRY, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const golden = (name: string): ScanReport =>
  JSON.parse(readFileSync(resolve(ROOT, 'fixtures', name, 'expected.json'), 'utf8')) as ScanReport;

/**
 * Goldens pin **detection**: which flags exist, where, and whether configuration
 * defines them. Evidence, debt score, and confidence depend on the repository's
 * commit history and on which languages a given build can read, so they are
 * asserted by unit tests rather than frozen into a file that would go stale on
 * every commit.
 */
const detectionShape = (report: ScanReport) =>
  report.flags.map(({ key, references, inConfiguration }) => ({
    key,
    references,
    inConfiguration,
  }));

describe('the built CLI', () => {
  it('is built (run `npm run build` first)', () => {
    expect(existsSync(ENTRY), `missing ${ENTRY}`).toBe(true);
  });

  it('prints its version and exits 0', () => {
    const { status, stdout } = cli(['--version']);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(CORE_VERSION);
  });

  it('exits non-zero on an unknown command', () => {
    const { status, stderr } = cli(['nope']);
    expect(status).toBe(1);
    expect(stderr).toContain("unknown command 'nope'");
  });

  it('scans a real directory and exits 0', () => {
    const { status, stdout } = cli(['scan', 'fixtures/ts-launchdarkly']);
    expect(status).toBe(0);
    expect(stdout).toContain('checkout-v2');
    expect(stdout).toContain('express-shipping');
  });

  it('reproduces the ts-launchdarkly golden exactly', () => {
    const { status, stdout } = cli(['scan', 'fixtures/ts-launchdarkly', '--json', '--no-git']);
    expect(status).toBe(0);

    const report = JSON.parse(stdout) as ScanReport;
    const expected = golden('ts-launchdarkly');

    // `root` is absolute at runtime and the fixture name in the golden; that is
    // the one field goldens deliberately normalize.
    expect(report.root.endsWith('fixtures/ts-launchdarkly')).toBe(true);
    expect(detectionShape(report)).toEqual(detectionShape(expected));
    expect(report.unresolvedReferences).toEqual(expected.unresolvedReferences);
    expect(report.schemaVersion).toBe(expected.schemaVersion);
    expect(report.positionEncoding).toBe(expected.positionEncoding);
  });

  it('reproduces the computed-keys golden, guessing nothing', () => {
    const { stdout } = cli(['scan', 'fixtures/computed-keys', '--json', '--no-git']);
    const report = JSON.parse(stdout) as ScanReport;
    const expected = golden('computed-keys');

    expect(detectionShape(report)).toEqual(detectionShape(expected));
    expect(report.unresolvedReferences).toEqual(expected.unresolvedReferences);
    expect(report.findings).toEqual(expected.findings);
  });

  it('correlates a Spring flag under a non-standard namespace', () => {
    // acmeco.allow-override-user-expiration is read by @ConditionalOnProperty and
    // defined in YAML. It was previously reported as "absent from configuration".
    const { stdout } = cli(['scan', 'fixtures/real-world-shapes', '--json', '--no-git']);
    const report = JSON.parse(stdout) as ScanReport;

    const flag = report.flags.find((f) => f.key === 'acmeco.allow-override-user-expiration');
    expect(flag, 'the annotation key must be inventoried').toBeDefined();
    expect(flag?.inConfiguration, 'and correlated with its YAML entry').toBe(true);
    expect(report.findings.map((f) => f.id)).not.toContain('flag.missing-in-configuration');
  });

  it('leaves unrelated boolean settings out of the inventory', () => {
    // spring.jpa.show-sql and server.compression.enabled are booleans under
    // non-flag namespaces that nothing reads as a flag. Promoting every boolean
    // would fill the inventory with ordinary configuration.
    const { stdout } = cli(['scan', 'fixtures/real-world-shapes', '--json', '--no-git']);
    const keys = (JSON.parse(stdout) as ScanReport).flags.map((f) => f.key);

    expect(keys).not.toContain('spring.jpa.show-sql');
    expect(keys).not.toContain('server.compression.enabled');
    expect(keys).toEqual([
      'acmeco.allow-override-user-expiration',
      'checkout-v2',
      'scheduledJobs.aiAppointment.enabled',
    ]);
  });

  it('reports no false positives from ordinary application code', () => {
    // OrdinaryCode.java contains .isEnabled(), getStringValue() and .variation()
    // with no SDK import. Every one of them was reported as a flag before.
    const { stdout } = cli(['scan', 'fixtures/real-world-shapes', '--json', '--no-git']);
    const report = JSON.parse(stdout) as ScanReport;

    const fromOrdinary = [
      ...report.flags.flatMap((f) => f.references),
      ...report.unresolvedReferences,
    ].filter((r) => r.range.file.endsWith('OrdinaryCode.java'));
    expect(fromOrdinary).toEqual([]);
    expect(report.unresolvedReferences).toEqual([]);
  });

  it('reproduces the java-togglz golden, which needs the discovery pass', () => {
    // Togglz detection depends on a workspace-wide first pass, so it cannot be
    // exercised by a single-file scan. Only a full run proves it — the golden was
    // previously a specification nothing checked against the engine.
    const { status, stdout } = cli(['scan', 'fixtures/java-togglz', '--json', '--no-git']);
    expect(status).toBe(0);

    const report = JSON.parse(stdout) as ScanReport;
    const expected = golden('java-togglz');
    expect(detectionShape(report)).toEqual(detectionShape(expected));
  });

  it('finds constants declared with constructor arguments', () => {
    // `NEW_CHECKOUT("checkout", true)` broke a comma-splitting parser and erased
    // the whole inventory rather than reporting a partial one.
    const { stdout } = cli(['scan', 'fixtures/java-togglz', '--json', '--no-git']);
    const keys = (JSON.parse(stdout) as ScanReport).flags.map((f) => f.key);
    expect(keys).toEqual(['LEGACY_EXPORT', 'NEW_CHECKOUT', 'RETIRED_BANNER']);
  });

  it('ignores an enum implementing an unrelated interface named Feature', () => {
    // ShippingOptions implements a local `Feature`; nothing there imports Togglz.
    const { stdout } = cli(['scan', 'fixtures/java-togglz', '--json', '--no-git']);
    const keys = (JSON.parse(stdout) as ScanReport).flags.map((f) => f.key);
    expect(keys).not.toContain('EXPRESS');
    expect(keys).not.toContain('STANDARD');
  });

  it('says nothing was found for the no-flags fixture', () => {
    const { status, stdout } = cli(['scan', 'fixtures/no-flags']);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('No feature flags found.');
  });

  it('produces byte-identical JSON across runs', () => {
    const a = cli(['scan', 'fixtures/ts-launchdarkly', '--json', '--no-git']).stdout;
    const b = cli(['scan', 'fixtures/ts-launchdarkly', '--json', '--no-git']).stdout;
    expect(a).toBe(b);
  });

  it('--no-git yields output free of history-dependent evidence', () => {
    // Deterministic output matters for CI diffing and for goldens: a report that
    // changes on every commit cannot be compared against a committed baseline.
    const { stdout } = cli(['scan', 'fixtures/ts-launchdarkly', '--json', '--no-git']);
    const report = JSON.parse(stdout) as ScanReport;
    const kinds = report.flags.flatMap((f) => f.evidence.map((e) => e.kind));

    expect(kinds).not.toContain('age-since-introduced');
    expect(kinds).not.toContain('time-since-last-modified');
  });

  it('collects real git evidence for its own repository', () => {
    // Flag Marshal is a git repository, so history must be available here. If
    // this ever passes vacuously the git port has silently stopped working.
    const { stdout } = cli(['scan', 'fixtures/java-spring-conditional', '--json']);
    const report = JSON.parse(stdout) as ScanReport;
    const kinds = report.flags.flatMap((f) => f.evidence.map((e) => e.kind));

    expect(kinds).toContain('age-since-introduced');
  });

  it('scans its own repository without crashing, and finds nothing in it', () => {
    // Flag Marshal has no feature flags. This exercises the walker against a
    // real tree with .gitignore, node_modules, dist, and a deep fixture corpus.
    const { status, stdout } = cli(['scan', '--json', '--no-git']);
    expect(status).toBe(0);

    const report = JSON.parse(stdout) as ScanReport;
    // Its own fixtures are the only flag-bearing files in the tree.
    const outsideFixtures = report.flags.filter((f) =>
      f.references.some((r) => !r.range.file.startsWith('fixtures/')),
    );
    expect(outsideFixtures).toEqual([]);
  });
});
