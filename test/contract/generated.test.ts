import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * The schema is the source of truth. These tests fail if committed artifacts
 * drift from it, which is the failure mode that would let the Kotlin models and
 * the TypeScript models disagree about the same payload.
 */
describe('generated artifacts are in sync with the schema', () => {
  const run = (script: string): string =>
    execFileSync('node', [resolve(ROOT, 'scripts', script), '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  it('committed TypeScript models match the schema', () => {
    expect(() => run('generate-types.mjs')).not.toThrow();
  });

  it('committed goldens match the fixture sources', () => {
    expect(() => run('build-goldens.mjs')).not.toThrow();
  });
});
