import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import type { ScanReport } from '../../src/core/api/index.js';
import { EXIT, run, type Snapshot } from '../../src/frontends/cli/cli.js';
import { memoryFs } from '../fakes/memory-fs.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const validate = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true }).compile(
  JSON.parse(readFileSync(resolve(ROOT, 'schema/v1/scan-report.schema.json'), 'utf8')) as object,
);

const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\n";
const SETTINGS =
  'policy:\n  requireOwner: true\nflags:\n  kept:\n    owner: team-a\n  legacy:\n    owner: team-a\n';

/** The workspace at the merge base. */
const BASE = {
  '/w/.flagmarshal.yml': SETTINGS,
  '/w/src/a.ts': `${LD}client.variation('kept', {}, false);\nclient.variation('legacy', {}, false);\n`,
};

/** The workspace now: `legacy` removed, `kept` read twice, `fresh` added with no owner. */
const HEAD = {
  '/w/.flagmarshal.yml': SETTINGS,
  '/w/src/a.ts':
    `${LD}client.variation('kept', {}, false);\nclient.variation('kept', {}, true);\n` +
    "client.variation('fresh', {}, false);\nclient.variation(name, {}, false);\n",
};

interface Options {
  readonly base?: Record<string, string>;
  readonly snapshot?: false | ((root: string, ref: string) => Promise<Snapshot>);
}

async function capture(argv: readonly string[], options: Options = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const requested: string[] = [];
  let closed = 0;
  const snapshot =
    options.snapshot === false
      ? undefined
      : (options.snapshot ??
        ((root: string, ref: string) => {
          requested.push(`${root} ${ref}`);
          return Promise.resolve({
            commit: '0123456789abcdef',
            fs: memoryFs(options.base ?? BASE),
            close: () => {
              closed++;
            },
          });
        }));
  const code = await run(argv, {
    fs: memoryFs(HEAD),
    cwd: '/w',
    now: 1_800_000_000,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    ...(snapshot === undefined ? {} : { snapshot }),
  });
  return { code, out: out.join('\n'), err: err.join('\n'), requested, closed };
}

describe('scan --changed-since', () => {
  it('reports what the change did, in both spellings of the option', async () => {
    for (const argv of [
      ['scan', '--changed-since', 'origin/main'],
      ['scan', '--changed-since=origin/main'],
    ]) {
      const { code, out, requested, closed } = await capture(argv);
      expect(code).toBe(EXIT.OK);
      expect(requested).toEqual(['/w origin/main']);
      expect(closed).toBe(1);
      expect(out).toContain('Changes since origin/main (merge base 01234567):');
      expect(out).toMatch(/Flags added:\n {2}fresh/);
      expect(out).toMatch(/Flags removed:\n {2}legacy/);
      expect(out).toContain('kept  1 -> 2');
      expect(out).toContain('Flag fresh has no owner');
      expect(out).toMatch(
        /Unresolved keys introduced.*\n {2}src\/a\.ts:6 {2}\[launchdarkly\] {2}name/,
      );
    }
  });

  it('keeps the path argument separate from the ref', async () => {
    const { requested } = await capture(['scan', '--changed-since', 'main', '/w']);
    expect(requested).toEqual(['/w main']);
  });

  it('says so plainly when nothing changed', async () => {
    const { code, out } = await capture(['scan', '--changed-since', 'main'], { base: HEAD });
    expect(code).toBe(EXIT.OK);
    expect(out).toBe('No flag changes since main (merge base 01234567).');
  });

  it('emits the whole report plus a schema-valid change set as JSON', async () => {
    const { out } = await capture(['scan', '--changed-since', 'main', '--json']);
    const report = JSON.parse(out) as ScanReport;

    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(report.flags.map((f) => f.key)).toEqual(['fresh', 'kept']);
    expect(report.changes).toMatchObject({
      since: { ref: 'main', commit: '0123456789abcdef' },
      addedFlags: ['fresh'],
      removedFlags: ['legacy'],
      changedFlags: [{ key: 'kept', referencesBefore: 1, referencesAfter: 2 }],
    });
    expect(report.changes?.introducedFindings.map((f) => `${f.id}:${f.flagKey}`)).toContain(
      'flag.missing-owner:fresh',
    );
  });

  it('writes a pull-request comment about the change only', async () => {
    const { out } = await capture(['scan', '--changed-since', 'main', '--format=markdown']);
    expect(out).toContain('Since `main` (merge base `01234567`): **1** added · **1** removed');
    expect(out).toContain('**Added:** `fresh`');
    expect(out).toContain('`kept` 1 → 2');
    expect(out).toContain('This change adds 1 call site whose flag key is computed');
  });

  it('puts only introduced findings in SARIF', async () => {
    const { out } = await capture(['scan', '--changed-since', 'main', '--format=sarif']);
    const sarif = JSON.parse(out) as { runs: { results: { ruleId: string }[] }[] };
    const rules = sarif.runs[0]?.results.map((r) => r.ruleId) ?? [];
    expect(rules).toContain('flag.missing-owner');
    // `kept` was already present at the base, so nothing about it is new.
    expect(out).not.toContain('"kept"');
  });

  it('fails with a usage error, not a guess, when the comparison is impossible', async () => {
    const rejected = await capture(['scan', '--changed-since', 'nope'], {
      snapshot: () => Promise.reject(new Error("no common history with 'nope'")),
    });
    expect(rejected.code).toBe(EXIT.USAGE);
    expect(rejected.err).toBe("flag-marshal: cannot compare: no common history with 'nope'");
    expect(rejected.out).toBe('');

    const unsupported = await capture(['scan', '--changed-since', 'main'], { snapshot: false });
    expect(unsupported.code).toBe(EXIT.USAGE);

    for (const argv of [
      ['scan', '--changed-since'],
      ['scan', '--changed-since='],
    ]) {
      const missing = await capture(argv);
      expect(missing.code).toBe(EXIT.USAGE);
      expect(missing.err).toContain('--changed-since needs a ref');
    }
  });

  it('is not an option of commands it does not apply to', async () => {
    for (const command of ['trend', 'init']) {
      const { code, err } = await capture([command, '--changed-since', 'main']);
      expect(code).toBe(EXIT.USAGE);
      expect(err).toContain("unknown option '--changed-since'");
    }
  });
});

describe('check --changed-since', () => {
  it('fails only on a policy violation the change introduced', async () => {
    const { code, out } = await capture(['check', '--changed-since', 'main']);
    expect(code).toBe(EXIT.POLICY);
    expect(out).toContain('1 new policy violation since main:');
    expect(out).toContain('Flag fresh has no owner');
  });

  it('passes when the violation was already there at the base', async () => {
    const base = {
      ...BASE,
      '/w/src/a.ts': `${BASE['/w/src/a.ts']}client.variation('fresh', {}, false);\n`,
    };
    const { code, out } = await capture(['check', '--changed-since', 'main'], { base });
    expect(code).toBe(EXIT.OK);
    expect(out).toBe('No new policy violations since main.');
  });

  it('credits a change with the violations it fixes', async () => {
    const { code, out } = await capture(['check', '--changed-since', 'main'], {
      base: {
        '/w/.flagmarshal.yml': SETTINGS,
        '/w/src/a.ts': `${LD}client.variation('gone', {}, false);\n`,
      },
    });
    expect(code).toBe(EXIT.POLICY);
    expect(out).toContain('1 policy violation from main is fixed by this change.');
  });

  it('carries only the introduced violations in JSON', async () => {
    const { out } = await capture(['check', '--changed-since', 'main', '--json']);
    const report = JSON.parse(out) as ScanReport;
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(report.findings.map((f) => `${f.id}:${f.flagKey}`)).toEqual([
      'flag.missing-owner:fresh',
    ]);
  });

  it('refuses to write a baseline from a comparison', async () => {
    const { code, err } = await capture(['check', '--changed-since', 'main', '--update-baseline']);
    expect(code).toBe(EXIT.USAGE);
    expect(err).toContain('cannot be combined');
  });
});
