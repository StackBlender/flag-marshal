import { describe, expect, it } from 'vitest';
import { openWorkspace } from '../../src/core/api/index.js';
import { memoryFs } from '../fakes/memory-fs.js';

const ROOT = '/repo';
const CODE = `import { initialize } from 'unleash-client';
const unleash = initialize({ url: 'x', appName: 'a' });
unleash.isEnabled('in-both');
unleash.isEnabled('code-only');
`;
const EXPORT = JSON.stringify({
  features: [
    { name: 'in-both' },
    { name: 'export-only' },
    { name: 'old-one', stale: true },
    { name: 'switched-off' },
  ],
  featureEnvironments: [
    { featureName: 'switched-off', environment: 'production', enabled: false },
    { featureName: 'in-both', environment: 'production', enabled: true },
  ],
});

const files = (extra: Record<string, string> = {}) =>
  memoryFs({ [`${ROOT}/src/app.ts`]: CODE, [`${ROOT}/provider/export.json`]: EXPORT, ...extra });

const scan = (
  fs: ReturnType<typeof files>,
  unleashExport?: Parameters<typeof openWorkspace>[0]['unleashExport'],
) =>
  openWorkspace({
    root: ROOT,
    fs,
    now: 1_700_000_000,
    ...(unleashExport === undefined ? {} : { unleashExport }),
  }).scan();

describe('offline Unleash export reconciliation', () => {
  it('adds nothing unless an export is named', async () => {
    expect((await scan(files())).providerState).toBeUndefined();
  });

  it('reports provenance and reconciles without claiming completeness', async () => {
    const report = await scan(files(), {
      file: `${ROOT}/provider/export.json`,
      environment: 'production',
    });
    expect(report.providerState).toEqual({
      provider: 'unleash',
      status: 'loaded',
      snapshot: {
        source: 'provider/export.json',
        exportedAt: null,
        environment: 'production',
        completeness: 'partial',
        featureCount: 4,
      },
      reconciliation: [
        { flagKey: 'export-only', kind: 'in-export-not-in-code' },
        { flagKey: 'old-one', kind: 'in-export-not-in-code' },
        { flagKey: 'old-one', kind: 'marked-stale-by-provider' },
        { flagKey: 'switched-off', kind: 'disabled-in-environment' },
        { flagKey: 'switched-off', kind: 'in-export-not-in-code' },
      ],
    });
  });

  it('reports a flag missing from the export only when declared complete', async () => {
    const complete = await scan(files(), {
      file: `${ROOT}/provider/export.json`,
      complete: true,
    });
    expect(complete.providerState?.snapshot.completeness).toBe('complete');
    expect(complete.providerState?.reconciliation).toContainEqual({
      flagKey: 'code-only',
      kind: 'in-code-not-in-export',
    });
  });

  it('never assumes an environment', async () => {
    const report = await scan(files(), { file: `${ROOT}/provider/export.json` });
    expect(report.providerState?.snapshot.environment).toBeNull();
    expect(report.providerState?.reconciliation.map((r) => r.kind)).not.toContain(
      'disabled-in-environment',
    );
  });

  it('says so when the environment is not in the export', async () => {
    const report = await scan(files(), {
      file: `${ROOT}/provider/export.json`,
      environment: 'staging',
    });
    expect(report.providerState?.status).toBe('environment-not-in-export');
    expect(report.providerState?.reconciliation).toEqual([]);
  });

  it('reports an unreadable or invalid export instead of failing the scan', async () => {
    const missing = await scan(files(), { file: `${ROOT}/nope.json` });
    expect(missing.providerState?.status).toBe('unreadable');
    const invalid = await scan(files({ [`${ROOT}/bad.json`]: '{"hello": 1}' }), {
      file: `${ROOT}/bad.json`,
    });
    expect(invalid.providerState?.status).toBe('invalid');
    expect(invalid.flags.length).toBeGreaterThan(0);
  });

  it('keeps host directories out of the source of an outside export', async () => {
    const report = await scan(files({ '/elsewhere/dump.json': EXPORT }), {
      file: '/elsewhere/dump.json',
    });
    expect(report.providerState?.snapshot.source).toBe('dump.json');
  });

  it('reads the export named in settings, and refuses a path outside the repository', async () => {
    const named = await scan(
      files({
        [`${ROOT}/.flagmarshal.yml`]:
          'providerState:\n  unleash:\n    export: provider/export.json\n    environment: production\n',
      }),
    );
    expect(named.providerState?.status).toBe('loaded');
    expect(named.providerState?.snapshot.environment).toBe('production');

    const outside = await scan(
      files({
        [`${ROOT}/.flagmarshal.yml`]: 'providerState:\n  unleash:\n    export: ../secret.json\n',
      }),
    );
    expect(outside.providerState).toBeUndefined();
  });

  it('adds no findings, so check has nothing new to fail on', async () => {
    const without = await scan(files());
    const withExport = await scan(files(), { file: `${ROOT}/provider/export.json` });
    expect(withExport.findings).toEqual(without.findings);
  });
});
