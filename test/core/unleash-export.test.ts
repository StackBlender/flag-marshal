import { describe, expect, it } from 'vitest';
import { openWorkspace, type ScanReport } from '../../src/core/api/index.js';
import { EXIT, run } from '../../src/frontends/cli/cli.js';
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

  it('rejects an export with malformed feature rows instead of treating them as absent', async () => {
    for (const [i, body] of [
      '{"features":[null]}',
      '{"features":[42]}',
      '{"features":[[]]}',
      '{"features":[{"name":""}]}',
      '{"features":[{"enabled":true}]}',
    ].entries()) {
      const path = `${ROOT}/malformed-${i}.json`;
      const report = await scan(files({ [path]: body }), { file: path });
      expect(report.providerState?.status).toBe('invalid');
      expect(report.providerState?.reconciliation).toEqual([]);
    }
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

describe('Unleash export options on the command line', () => {
  const cli = async (argv: string[], fs: ReturnType<typeof files> = files()) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(argv, {
      fs,
      cwd: ROOT,
      now: 1_700_000_000,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const json = async (argv: string[], fs?: ReturnType<typeof files>) => {
    const result = await cli(['scan', '--json', '--no-git', ...argv], fs);
    expect(result.code).toBe(EXIT.OK);
    return JSON.parse(result.out) as ScanReport;
  };

  it('accepts both the spaced and the = forms, resolved against cwd', async () => {
    const spaced = await json([
      '--unleash-export',
      'provider/export.json',
      '--unleash-environment',
      'production',
    ]);
    const joined = await json([
      '--unleash-export=provider/export.json',
      '--unleash-environment=production',
    ]);
    expect(spaced.providerState?.snapshot.source).toBe('provider/export.json');
    expect(spaced.providerState?.snapshot.environment).toBe('production');
    expect(joined.providerState).toEqual(spaced.providerState);
  });

  it('rejects a missing value and options that the command does not take', async () => {
    const missing = await cli(['scan', '--unleash-export']);
    expect(missing.code).toBe(EXIT.USAGE);
    expect(missing.err).toContain('--unleash-export needs a value');

    const empty = await cli(['scan', '--unleash-environment=']);
    expect(empty.code).toBe(EXIT.USAGE);
    expect(empty.err).toContain('--unleash-environment needs a value');

    const onCheck = await cli(['check', '--unleash-export', 'provider/export.json']);
    expect(onCheck.code).toBe(EXIT.USAGE);
    expect(onCheck.err).toContain("unknown option '--unleash-export'");
  });

  it('reports provenance and leads in human output, never deletion advice', async () => {
    const { code, out } = await cli([
      'scan',
      '--no-git',
      '--unleash-export',
      'provider/export.json',
      '--unleash-environment',
      'production',
      '--unleash-complete',
    ]);
    expect(code).toBe(EXIT.OK);
    expect(out).toContain('Unleash export: provider/export.json');
    expect(out).toContain('environment: production; declared complete; 4 features');
    expect(out).toContain('code-only: read in code, absent from the export');
    expect(out).toContain('old-one: marked stale in Unleash');
    expect(out).toContain('switched-off: disabled in the chosen environment');
    expect(out).toContain('These are leads to check, not advice to delete.');
    expect(out).not.toMatch(/safe to delete/i);
  });

  it('says when the export is partial or unreadable in human output', async () => {
    const partial = await cli(['scan', '--no-git', '--unleash-export', 'provider/export.json']);
    expect(partial.out).toContain('environment: none chosen; partial, so absence proves nothing');

    const unreadable = await cli(['scan', '--no-git', '--unleash-export', 'missing.json']);
    expect(unreadable.code).toBe(EXIT.OK);
    expect(unreadable.out).toContain('the export could not be read');
  });

  it('includes the reconciliation in JSON output', async () => {
    const report = await json(['--unleash-export', 'provider/export.json', '--unleash-complete']);
    expect(report.providerState?.status).toBe('loaded');
    expect(report.providerState?.snapshot.completeness).toBe('complete');
    expect(report.providerState?.reconciliation).toContainEqual({
      flagKey: 'code-only',
      kind: 'in-code-not-in-export',
    });
  });

  it('overrides settings field by field', async () => {
    const configured = files({
      [`${ROOT}/provider/other.json`]: JSON.stringify({ features: [{ name: 'in-both' }] }),
      [`${ROOT}/.flagmarshal.yml`]:
        'providerState:\n  unleash:\n    export: provider/export.json\n    environment: staging\n    complete: false\n',
    });

    const fromSettings = await json([], configured);
    expect(fromSettings.providerState?.snapshot).toMatchObject({
      source: 'provider/export.json',
      environment: 'staging',
      completeness: 'partial',
    });

    const environment = await json(['--unleash-environment', 'production'], configured);
    expect(environment.providerState?.snapshot).toMatchObject({
      source: 'provider/export.json',
      environment: 'production',
      completeness: 'partial',
    });

    const complete = await json(['--unleash-complete'], configured);
    expect(complete.providerState?.snapshot).toMatchObject({
      source: 'provider/export.json',
      environment: 'staging',
      completeness: 'complete',
    });

    const file = await json(['--unleash-export', 'provider/other.json'], configured);
    expect(file.providerState?.snapshot).toMatchObject({
      source: 'provider/other.json',
      environment: 'staging',
      completeness: 'partial',
      featureCount: 1,
    });
  });
});
