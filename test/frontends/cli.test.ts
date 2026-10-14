import { describe, expect, it } from 'vitest';
import {
  CORE_VERSION,
  noGitHistory,
  type DirectoryEntry,
  type FileSystem,
  type GitHistory,
} from '../../src/core/api/index.js';
import { EXIT, run } from '../../src/frontends/cli/cli.js';
import type { Baselines } from '../../src/core/api/index.js';
import { type Baseline } from '../../src/core/api/index.js';

/** Detection requires the SDK import; workspaces below carry a realistic one. */
const LD =
  "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\nconst c = init('');\n";

/** An in-memory workspace. The filesystem port exists so this is possible. */
function memoryFs(files: Record<string, string>): FileSystem {
  return {
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const names = new Set<string>();
      const dirs = new Set<string>();
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash === -1) names.add(rest);
        else dirs.add(rest.slice(0, slash));
      }
      if (names.size === 0 && dirs.size === 0) throw new Error(`ENOENT: ${path}`);
      return [
        ...[...dirs].map((name) => ({
          name,
          isDirectory: true,
          isFile: false,
          isSymbolicLink: false,
        })),
        ...[...names].map((name) => ({
          name,
          isDirectory: false,
          isFile: true,
          isSymbolicLink: false,
        })),
      ];
    },
    async readFile(path: string): Promise<string> {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
  };
}

/** An in-memory baseline store, so the ratchet is testable without a filesystem. */
function memoryBaselines(initial?: Baseline) {
  let stored = initial;
  return {
    store: {
      read: () => Promise.resolve(stored),
      write: (_root: string, baseline: Baseline) => {
        stored = baseline;
        return Promise.resolve();
      },
    },
    current: () => stored,
  };
}

async function capture(
  argv: readonly string[],
  files: Record<string, string> = {},
  options: { baselines?: Baselines; now?: number; git?: GitHistory } = {},
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    fs: memoryFs(files),
    cwd: '/w',
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ...(options.baselines === undefined ? {} : { baselines: options.baselines }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.git === undefined ? {} : { git: () => options.git as GitHistory }),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('invalid settings', () => {
  const files = {
    '/w/src/a.ts': LD,
    '/w/.flagmarshal.yml': 'policy:\n  requireOwner: yes please\n',
  };

  it('fails check instead of silently disabling policy', async () => {
    const { code, err, out } = await capture(['check'], files);
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain('policy.requireOwner');
    expect(err).toContain('policy was not enforced');
    expect(out).toBe('');
  });

  it('refuses to write a baseline from invalid settings', async () => {
    const baselines = memoryBaselines();
    const { code } = await capture(['check', '--update-baseline'], files, {
      baselines: baselines.store,
    });
    expect(code).toBe(EXIT.USAGE);
    expect(baselines.current()).toBeUndefined();
  });

  it('still scans, with the diagnostics on stderr', async () => {
    const { code, err, out } = await capture(['scan', '--json'], files);
    expect(code).toBe(EXIT.OK);
    expect(err).toContain('policy.requireOwner');
    expect(() => JSON.parse(out) as unknown).not.toThrow();
  });
});

describe('invalid Unleash export settings', () => {
  const files = {
    '/w/src/a.ts': LD + "client.variation('checkout', u, false);\n",
    '/w/.flagmarshal.yml': 'providerState:\n  unleash:\n    export: exports/unleash.json\n',
  };
  const diagnostic =
    'flag-marshal: .flagmarshal.yml: providerState.unleash.export must name a readable file inside the repository';

  it('refuses check but still emits a scan report with the same diagnostic', async () => {
    const check = await capture(['check'], files);
    expect(check.code).toBe(EXIT.USAGE);
    expect(check.err).toContain(diagnostic);
    expect(check.err).toContain('policy was not enforced');
    expect(check.out).toBe('');

    const scan = await capture(['scan', '--json'], files);
    expect(scan.code).toBe(EXIT.OK);
    expect(scan.err).toContain(diagnostic);
    const report = JSON.parse(scan.out) as { schemaVersion: string; flags: unknown[] };
    expect(report.schemaVersion).toBe('1.0');
    expect(report.flags).toHaveLength(1);
  });
});

describe('invalid flag metadata', () => {
  const files = {
    '/w/src/a.ts': LD,
    '/w/.flagmarshal.yml': 'flags:\n  secret-launch:\n    owner: 7\n    expiry: nope\n',
  };

  it.each([['scan'], ['check'], ['check', '--update-baseline']])(
    'never prints the flag key for %j',
    async (...argv) => {
      const { err } = await capture(argv.flat(), files, { baselines: memoryBaselines().store });
      expect(err).toContain('flags[entry 1].owner');
      expect(err).not.toContain('secret-launch');
    },
  );
});

describe('unknown policy settings', () => {
  it('rejects a misspelled policy field in check', async () => {
    const { code, err } = await capture(['check'], {
      '/w/src/a.ts': LD,
      '/w/.flagmarshal.yml': 'policy:\n  requireOwnr: true\n',
    });
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain('policy.requireOwnr');
  });
});

describe('cli basics', () => {
  it.each([[], ['-h'], ['--help']])('prints usage for %j', async (...argv) => {
    const { code, out } = await capture(argv.flat());
    expect(code).toBe(EXIT.OK);
    expect(out).toContain('Usage:');
  });

  it.each(['-v', '--version'])('prints the core version for %s', async (flag) => {
    const { code, out } = await capture([flag]);
    expect(code).toBe(EXIT.OK);
    expect(out).toBe(CORE_VERSION);
  });

  it('states the local-only guarantee in its usage text', async () => {
    expect((await capture([])).out).toContain('no network calls');
  });

  it('runs check against an empty workspace without complaint', async () => {
    const { code, out } = await capture(['check'], { '/w/src/a.ts': 'export const a = 1;\n' });
    expect(code).toBe(EXIT.OK);
    expect(out).toContain('No policy violations');
  });

  it('rejects an unknown command', async () => {
    const { code, err } = await capture(['wat']);
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain("unknown command 'wat'");
  });

  it('no longer has the editor server, dropped with the editor frontends', async () => {
    const { code, err, out } = await capture(['serve', '--stdio']);
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain("unknown command 'serve'");
    expect(out).not.toContain('serve');
  });

  it('rejects an unknown option to scan', async () => {
    const { code, err } = await capture(['scan', '--nope']);
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain("unknown option '--nope'");
  });

  it('rejects more than one path', async () => {
    const { code, err } = await capture(['scan', 'a', 'b']);
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain('at most one path');
  });
});

describe('scan', () => {
  const workspace = {
    '/w/src/checkout.ts': LD + "client.variation('checkout-v2', u, false);\n",
    '/w/src/pricing.ts': LD + "client.variation('checkout-v2', u, false);\n",
    '/w/src/legacy.ts': LD + "client.variation('old-banner', u, false);\n",
    '/w/README.md': '# docs\n',
  };

  it('inventories flags across the workspace', async () => {
    const { code, out } = await capture(['scan'], workspace);
    expect(code).toBe(EXIT.OK);
    expect(out).toContain('2 feature flags, 3 references');
    expect(out).toContain('checkout-v2');
    expect(out).toContain('old-banner');
  });

  it('prints 1-based line numbers for humans', async () => {
    const { out } = await capture(['scan'], workspace);
    // Stored 0-based; the frontend converts at its edge. The flag follows the
    // import and client binding that make it detectable at all.
    expect(out).toMatch(/src\/checkout\.ts:\d+/);
    const line = /src\/checkout\.ts:(\d+)/.exec(out)?.[1];
    expect(Number(line), 'displayed line numbers are 1-based').toBeGreaterThan(0);
  });

  it('exits 0 even when it finds debt, because scan reports and check enforces', async () => {
    expect((await capture(['scan'], workspace)).code).toBe(EXIT.OK);
  });

  it('says so plainly when there is nothing to report', async () => {
    const { code, out } = await capture(['scan'], { '/w/src/math.ts': 'export const a = 1;\n' });
    expect(code).toBe(EXIT.OK);
    expect(out).toBe('No feature flags found.');
  });

  it('emits a schema-shaped report with --json', async () => {
    const { code, out } = await capture(['scan', '--json'], workspace);
    expect(code).toBe(EXIT.OK);

    const report = JSON.parse(out);
    expect(report.schemaVersion).toBe('1.0');
    expect(report.tool.name).toBe('flag-marshal');
    expect(report.positionEncoding).toBe('utf-16');
    expect(report.root).toBe('/w');
    expect(report.flags.map((f: { key: string }) => f.key)).toEqual(['checkout-v2', 'old-banner']);
    expect(report.findings).toEqual([]);
  });

  it('produces byte-identical output across runs', async () => {
    const a = await capture(['scan', '--json'], workspace);
    const b = await capture(['scan', '--json'], workspace);
    expect(a.out).toBe(b.out);
  });

  it('marks a flag referenced only from tests', async () => {
    const { out } = await capture(['scan'], {
      '/w/src/thing.test.ts': LD + "client.variation('only-in-tests', u, false);\n",
    });
    expect(out).toContain('(test code only)');
  });

  it('reports unresolved keys without inventing them', async () => {
    const { out } = await capture(['scan'], {
      '/w/src/dyn.ts': LD + 'client.variation(PREFIX + name, u, false);\n',
    });
    expect(out).toContain('could not be resolved');
    expect(out).toContain('PREFIX + name');
    expect(out).toContain('never guessed');
    // The provider is named so a reader can verify this really is an SDK call
    // rather than an ordinary method that shares a name with one.
    expect(out).toContain('[launchdarkly]');
  });

  it('does not report an ordinary method that merely shares an SDK name', async () => {
    // No LaunchDarkly import, so `.variation(...)` here is somebody's domain
    // method. Reporting it was the single worst false positive in real testing.
    const { out } = await capture(['scan'], {
      '/w/src/plan.ts': "export const r = (p) => p.variation('standard');\n",
    });
    expect(out).toBe('No feature flags found.');
  });

  it('scans a subdirectory when given a path', async () => {
    const { out } = await capture(['scan', 'src/nested'], {
      '/w/src/nested/a.ts': LD + "client.variation('inner', u, false);\n",
      '/w/src/other/b.ts': LD + "client.variation('outer', u, false);\n",
    });
    expect(out).toContain('inner');
    expect(out).not.toContain('outer');
  });
});

describe('check', () => {
  const policy = 'policy:\n  requireOwner: true\n  requireExpiry: true\n';
  const twoFlags = {
    '/w/.flagmarshal.yml': policy,
    '/w/src/a.ts':
      LD + ["c.variation('alpha', u, false);", "c.variation('beta', u, false);"].join('\n'),
  };

  it('fails and explains itself when no baseline exists', async () => {
    const { code, out } = await capture(['check'], twoFlags, {
      baselines: memoryBaselines().store,
    });
    expect(code).toBe(EXIT.POLICY);
    expect(out).toContain('no baseline yet');
    expect(out).toContain('--update-baseline');
  });

  it('records existing debt with --update-baseline', async () => {
    const baselines = memoryBaselines();
    const { code, out } = await capture(['check', '--update-baseline'], twoFlags, {
      baselines: baselines.store,
    });
    expect(code).toBe(EXIT.OK);
    expect(out).toContain('4 existing violations accepted');
    expect(baselines.current()?.accepted).toHaveLength(4);
  });

  it('passes on a repository with heavy existing debt once baselined', async () => {
    // The adoption mechanic: a team that has done nothing wrong yet must not be
    // greeted by a wall of failures on day one.
    const baselines = memoryBaselines();
    await capture(['check', '--update-baseline'], twoFlags, {
      baselines: baselines.store,
    });

    const { code, out } = await capture(['check'], twoFlags, {
      baselines: baselines.store,
    });
    expect(code).toBe(EXIT.OK);
    expect(out).toContain('No new policy violations');
    expect(out).toContain('4 existing violations still accepted');
  });

  it('fails when one new unowned flag is added', async () => {
    const baselines = memoryBaselines();
    await capture(['check', '--update-baseline'], twoFlags, {
      baselines: baselines.store,
    });

    const withNewFlag = {
      ...twoFlags,
      '/w/src/a.ts': `${twoFlags['/w/src/a.ts']}\nc.variation('gamma', u, false);`,
    };
    const { code, out } = await capture(['check'], withNewFlag, {
      baselines: baselines.store,
    });

    expect(code).toBe(EXIT.POLICY);
    expect(out).toContain('gamma');
    expect(out, 'baselined flags must not be re-reported as new').not.toContain('alpha');
  });

  it('reports debt that has been paid off', async () => {
    const baselines = memoryBaselines();
    await capture(['check', '--update-baseline'], twoFlags, {
      baselines: baselines.store,
    });

    const fixed = {
      ...twoFlags,
      '/w/src/a.ts': [
        '// flag-marshal: alpha owner=team-a expiry=2030-01-01',
        '// flag-marshal: beta owner=team-b expiry=2030-01-01',
        twoFlags['/w/src/a.ts'],
      ].join('\n'),
    };
    const { code, out } = await capture(['check'], fixed, {
      baselines: baselines.store,
    });

    expect(code).toBe(EXIT.OK);
    expect(out).toContain('no longer occur');
  });

  it('exits 0 when policy is not configured at all', async () => {
    const { code } = await capture(['check'], {
      '/w/src/a.ts': LD + "c.variation('x', u, false);",
    });
    expect(code).toBe(EXIT.OK);
  });

  it('enforces policy findings but never drift findings', async () => {
    // Failing a build on an inference is how a tool loses a team's trust.
    // The flag below is referenced ONLY from a test, so `flag.test-only` really
    // does fire during scan — and `check` must still pass.
    const workspace = { '/w/src/a.test.ts': LD + "c.variation('only-in-tests', u, false);" };

    const scanned = await capture(['scan'], workspace);
    expect(scanned.out, 'the drift finding must actually be raised').toContain('test code');

    const { code } = await capture(['check'], workspace);
    expect(code, 'but check must not fail on it').toBe(EXIT.OK);
  });
});

describe('one free tool', () => {
  const workspace = { '/w/src/a.ts': LD + "c.variation('alpha', u, false);" };

  it.each([
    [['scan']],
    [['scan', '--json']],
    [['scan', '--format=markdown']],
    [['scan', '--format=sarif']],
    [['check']],
  ])('runs %j with no licence, key, or configuration', async (argv) => {
    const { code, err } = await capture(argv, workspace);
    expect(code).toBe(EXIT.OK);
    expect(err).toBe('');
  });

  it('never mentions a tier', async () => {
    for (const argv of [['scan'], ['check'], ['trend'], ['--help']]) {
      const { out, err } = await capture(argv, workspace);
      expect(`${out}\n${err}`).not.toMatch(/\b(Team|Pro|Free) (capability|installation|tier)\b/);
    }
  });

  it('finds custom-pattern flags', async () => {
    // A shop with a homegrown helper would otherwise see nothing at all.
    const { out } = await capture(['scan'], {
      '/w/.flagmarshal.yml': 'customPatterns:\n  methods: [isFeatureOn]\n',
      '/w/src/a.ts': "Features.isFeatureOn('homegrown');",
    });
    expect(out).toContain('homegrown');
  });
});

describe('check: maximum flag age', () => {
  const NOW = Date.parse('2026-06-01T00:00:00Z') / 1000;
  const DAY = 86_400;
  const old: GitHistory = {
    ...noGitHistory,
    isAvailable: () => Promise.resolve(true),
    historyOf: () => Promise.resolve({ firstSeen: NOW - 500 * DAY, lastChanged: NOW - 500 * DAY }),
  };
  const config = '/w/.flagmarshal.yml';
  const policy = 'policy:\n  maxAgeDays: 180\n';
  const ld = { [config]: policy, '/w/src/a.ts': LD + "c.variation('old-flag', u, false);" };
  const spring = {
    [config]: policy,
    '/w/src/A.java':
      'import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;\n' +
      '@ConditionalOnProperty("queue.listener.enabled")\nclass A {}\n',
  };

  it('enforces the limit on a provider that implies temporary intent', async () => {
    const { code, out } = await capture(['check'], ld, {
      baselines: memoryBaselines().store,
      now: NOW,
      git: old,
    });
    expect(code).toBe(EXIT.POLICY);
    expect(out).toContain('old-flag');
  });

  it('accepts an age violation once baselined', async () => {
    const baselines = memoryBaselines();
    await capture(['check', '--update-baseline'], ld, {
      baselines: baselines.store,
      now: NOW,
      git: old,
    });
    expect(baselines.current()?.accepted).toContain('flag.too-old:old-flag');
    const { code } = await capture(['check'], ld, {
      baselines: baselines.store,
      now: NOW,
      git: old,
    });
    expect(code).toBe(EXIT.OK);
  });

  it('does not enforce unknown age', async () => {
    const { code } = await capture(['check'], ld, {
      baselines: memoryBaselines().store,
      now: NOW,
    });
    expect(code).toBe(EXIT.OK);
  });

  it('never reports a Spring operational switch as too old', async () => {
    const { code, out } = await capture(['check'], spring, {
      baselines: memoryBaselines().store,
      now: NOW,
      git: old,
    });
    expect(code).toBe(EXIT.OK);
    expect(out).not.toContain('queue.listener.enabled');
  });
});
