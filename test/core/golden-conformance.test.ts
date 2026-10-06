import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIndex, scanSource } from '../../src/core/api/index.js';
import type { FlagReference, ScanReport } from '../../src/core/api/index.js';

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'fixtures');

const golden = (name: string): ScanReport =>
  JSON.parse(readFileSync(resolve(FIXTURES, name, 'expected.json'), 'utf8')) as ScanReport;

async function scanFiles(fixture: string, paths: string[]): Promise<FlagReference[]> {
  const all: FlagReference[] = [];
  for (const path of paths) {
    const text = readFileSync(resolve(FIXTURES, fixture, path), 'utf8');
    all.push(...(await scanSource({ path, text })));
  }
  return all;
}

/**
 * The moment the goldens stop being a specification and start being a regression
 * test. Milestone 1 wrote these files by hand as the acceptance criteria for
 * detection; Milestone 2 must reproduce them exactly.
 *
 * Every fixture is now covered. Milestone 1 wrote these files by hand before any
 * engine existed; Milestone 6 is the point at which the engine reproduces all of
 * them.
 */
describe('detection reproduces the committed goldens', () => {
  it('ts-launchdarkly matches exactly', async () => {
    const expected = golden('ts-launchdarkly');
    const index = buildIndex(
      await scanFiles('ts-launchdarkly', ['src/checkout.ts', 'src/pricing.ts']),
    );

    expect(index.flags).toEqual(expected.flags);
    expect(index.unresolvedReferences).toEqual(expected.unresolvedReferences);
  });

  it('computed-keys matches exactly, including both unresolved expressions', async () => {
    const expected = golden('computed-keys');
    const index = buildIndex(await scanFiles('computed-keys', ['src/dynamic.ts']));

    expect(index.flags).toEqual(expected.flags);
    expect(index.unresolvedReferences).toEqual(expected.unresolvedReferences);
  });

  it('no-flags produces nothing at all', async () => {
    const expected = golden('no-flags');
    const index = buildIndex(await scanFiles('no-flags', ['src/math.ts']));

    expect(index.flags).toEqual(expected.flags);
    expect(index.unresolvedReferences).toEqual(expected.unresolvedReferences);
  });

  it('mixed-polyglot merges one key across Java and TypeScript', async () => {
    const expected = golden('mixed-polyglot');
    const index = buildIndex(
      await scanFiles('mixed-polyglot', [
        'service/src/main/java/com/example/BillingService.java',
        'web/src/banner.ts',
      ]),
    );

    expect(index.flags).toEqual(expected.flags);
  });

  it('real-world-shapes matches exactly, false positives and all', async () => {
    // The fixture that exists because real repositories broke the detector.
    const expected = golden('real-world-shapes');
    const index = buildIndex(
      await scanFiles('real-world-shapes', [
        'src/main/java/com/example/OrdinaryCode.java',
        'src/main/java/com/example/RealFlags.java',
        'src/main/kotlin/com/example/Conditionals.kt',
      ]),
    );

    // Ordinary application code contributes nothing at all.
    const codeOnly = expected.flags
      .map((flag) => ({
        ...flag,
        references: flag.references.filter((r) => r.kind !== 'configuration'),
      }))
      .filter((flag) => flag.references.length > 0)
      .map((flag) => ({ ...flag, inConfiguration: false }));

    expect(index.flags).toEqual(codeOnly);
    expect(index.unresolvedReferences).toEqual([]);
  });

  it('kotlin-unleash matches exactly', async () => {
    const expected = golden('kotlin-unleash');
    const index = buildIndex(await scanFiles('kotlin-unleash', ['src/Search.kt']));

    expect(index.flags).toEqual(expected.flags);
  });

  it('java-spring-conditional matches its code references', async () => {
    // Configuration references come from the config parser rather than the
    // source scanner, so only the code half is comparable here; the process
    // tests assert the whole report.
    const expected = golden('java-spring-conditional');
    const index = buildIndex(
      await scanFiles('java-spring-conditional', [
        'src/main/java/com/example/ReportingConfig.java',
      ]),
    );

    const expectedCode = expected.flags
      .flatMap((f) => f.references)
      .filter((r) => r.kind !== 'configuration');
    const actualCode = index.flags.flatMap((f) => f.references);

    expect(actualCode).toEqual(expectedCode);
  });
});
