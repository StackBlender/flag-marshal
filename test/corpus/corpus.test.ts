import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CORPUS = process.env['FLAG_MARSHAL_CORPUS'] ?? resolve(homedir(), 'flag-marshal-corpus');
const BASELINE = resolve(ROOT, 'corpus-baseline.json');

interface Measurement {
  flags: number;
  unresolved: number;
  providers: string[];
  unsupported: string[];
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Measurement>;

/**
 * The committed baseline is checked even when the corpus is not cloned, because
 * it is a claim about coverage that must stay true regardless of what is on disk.
 */
describe('corpus baseline', () => {
  it('covers every supported provider at least twice', () => {
    // Fixtures are written by whoever wrote the detector. Two independent real
    // repositories per provider is the cheapest guard against a whole provider
    // silently breaking.
    const byProvider = new Map<string, string[]>();
    for (const [name, measurement] of Object.entries(baseline)) {
      for (const provider of measurement.providers) {
        byProvider.set(provider, [...(byProvider.get(provider) ?? []), name]);
      }
    }

    for (const provider of [
      'launchdarkly',
      'openfeature',
      'unleash',
      'togglz',
      'spring-conditional',
      'properties',
    ]) {
      const repositories = byProvider.get(provider) ?? [];
      expect(
        repositories.length,
        `${provider} is covered by ${repositories.join(', ') || 'nothing'}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps repositories that should find nothing, as noise checks', () => {
    // A repository with no supported provider must stay at zero. It is the only
    // guard against a change that starts reporting flags everywhere.
    const quiet = Object.entries(baseline).filter(([, m]) => m.flags === 0);
    expect(quiet.length, 'at least one repository must be expected to be silent').toBeGreaterThan(
      0,
    );
  });
});

/**
 * The scan itself needs the corpus on disk, so it is skipped when absent. CI does
 * not clone 200MB of other people's repositories; a developer runs it before
 * changing detection.
 */
describe.skipIf(!existsSync(CORPUS))('corpus scan', () => {
  it('detects no fewer flags than the baseline records', () => {
    expect(() => {
      execFileSync('node', [resolve(ROOT, 'scripts/scan-corpus.mjs'), '--check'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 600_000,
      });
    }).not.toThrow();
  }, 600_000);
});
