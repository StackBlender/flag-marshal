import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORE_VERSION } from '../../src/core/api/index.js';

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', '..', 'package.json'), 'utf8'),
) as { name: string; version: string; private?: boolean };
const published = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '..', '..', 'artifacts', 'npm', 'package', 'package.json'),
    'utf8',
  ),
) as { name: string; version: string; publishConfig?: { access?: string }; private?: boolean };

describe('published identity', () => {
  it('reports the same version the package declares', () => {
    // Every report embeds tool.coreVersion. If it drifts from the published
    // version, an archived report cannot be traced back to the build that wrote it.
    expect(CORE_VERSION).toBe(pkg.version);
  });

  it('is the scoped name, matching the rest of the portfolio', () => {
    expect(pkg.name).toBe('@stackblender/flag-marshal');
    expect(published.name).toBe(pkg.name);
    expect(published.version).toBe(pkg.version);
  });

  it('keeps the source private and makes only the release artifact public', () => {
    // Publishing from the repository root must fail. The assembled artifact has
    // the public access metadata required by a scoped package and npx.
    expect(pkg.private).toBe(true);
    expect(published.publishConfig?.access).toBe('public');
    expect(published.private).toBeUndefined();
  });
});
