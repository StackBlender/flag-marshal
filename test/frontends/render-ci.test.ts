import { describe, expect, it } from 'vitest';
import type { Finding, ScanReport } from '../../src/core/api/index.js';
import { EXIT, run, type Snapshot } from '../../src/frontends/cli/cli.js';
import { renderCodeQuality, renderGithub } from '../../src/frontends/cli/render-ci.js';
import { memoryFs } from '../fakes/memory-fs.js';

function finding(parts: Partial<Finding> & { line?: number; file?: string }): Finding {
  const { line, file, ...rest } = parts;
  return {
    id: 'flag.missing-owner',
    flagKey: 'k',
    severity: 'warning',
    confidence: 'high',
    evidence: [{ kind: 'declared-owner', detail: false }],
    ...(line === undefined
      ? {}
      : {
          range: {
            file: file ?? 'src/a.ts',
            start: { line, character: 4 },
            end: { line, character: 9 },
          },
        }),
    ...rest,
  } as Finding;
}

function report(findings: Finding[]): ScanReport {
  return {
    schemaVersion: '1.0',
    tool: { name: 'flag-marshal', coreVersion: '0.0.0' },
    root: '/w',
    positionEncoding: 'utf-16',
    flags: [],
    unresolvedReferences: [],
    findings,
  };
}

describe('renderGithub', () => {
  it('prints one workflow command per finding, 1-based, under the checkout prefix', () => {
    const out = renderGithub(report([finding({ line: 2 })]), 'services/api');
    expect(out).toBe(
      '::warning file=services/api/src/a.ts,line=3,endLine=3,col=5,endColumn=10,' +
        'title=Flag Marshal%3A flag.missing-owner::Flag k has no owner (confidence: high).' +
        ' Why: no owner is declared',
    );
  });

  it('maps severities to the commands GitHub has', () => {
    const out = renderGithub(
      report([
        finding({ severity: 'error' }),
        finding({ severity: 'warning' }),
        finding({ severity: 'info' }),
      ]),
      '',
    );
    expect(out.split('\n').map((line) => line.split(' ')[0])).toEqual([
      '::error',
      '::warning',
      '::notice',
    ]);
  });

  it('escapes what would otherwise end or split a command', () => {
    const out = renderGithub(
      report([finding({ flagKey: 'a%b\nc', line: 0, file: 'odd,dir/x:y.ts' })]),
      '',
    );
    expect(out.split('\n')).toHaveLength(1);
    expect(out).toContain('file=odd%2Cdir/x%3Ay.ts,');
    expect(out).toContain('Flag a%25b%0Ac has no owner');
  });

  it('leaves out the file for a finding with no position, so it lands on the run', () => {
    const out = renderGithub(report([finding({ id: 'flag.budget-exceeded', flagKey: null })]), '');
    expect(out.startsWith('::warning title=Flag Marshal%3A flag.budget-exceeded::')).toBe(true);
  });

  it('prints nothing when there is nothing to annotate', () => {
    expect(renderGithub(report([]), '')).toBe('');
  });
});

describe('renderCodeQuality', () => {
  type Issue = {
    fingerprint: string;
    severity: string;
    check_name: string;
    location: { path: string; lines: { begin: number } };
  };
  const issues = (findings: Finding[], prefix = ''): Issue[] =>
    JSON.parse(renderCodeQuality(report(findings), prefix)) as Issue[];

  it('writes GitLab issues with 1-based lines and mapped severities', () => {
    const [issue] = issues([finding({ line: 6, severity: 'error' })], 'app');
    expect(issue).toMatchObject({
      check_name: 'flag.missing-owner',
      severity: 'major',
      location: { path: 'app/src/a.ts', lines: { begin: 7 } },
    });
  });

  it('keeps a fingerprint when the code moves, and keeps alike findings apart', () => {
    const before = issues([finding({ line: 1 })])[0]?.fingerprint;
    const after = issues([finding({ line: 40 })])[0]?.fingerprint;
    expect(after).toBe(before);

    const alike = issues([finding({ line: 1 }), finding({ line: 2 })]).map((i) => i.fingerprint);
    expect(new Set(alike).size).toBe(2);

    const otherFile = issues([finding({ line: 1, file: 'src/b.ts' })])[0]?.fingerprint;
    expect(otherFile).not.toBe(before);
  });

  it('places a finding with no position on the settings file that declares the policy', () => {
    const [issue] = issues([finding({ id: 'flag.budget-exceeded', flagKey: null })]);
    expect(issue?.location).toEqual({ path: '.flagmarshal.yml', lines: { begin: 1 } });
  });

  it('writes an empty array when there is nothing to report', () => {
    expect(renderCodeQuality(report([]), '')).toBe('[]');
  });
});

describe('CI formats from the command line', () => {
  const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\n";
  const HEAD = {
    '/w/app/.flagmarshal.yml': 'policy:\n  requireOwner: true\n',
    '/w/app/src/a.ts': `${LD}client.variation('old', {}, false);\nclient.variation('fresh', {}, false);\n`,
  };
  const BASE = {
    '/w/app/.flagmarshal.yml': 'policy:\n  requireOwner: true\n',
    '/w/app/src/a.ts': `${LD}client.variation('old', {}, false);\n`,
  };

  async function capture(argv: string[]) {
    const out: string[] = [];
    const code = await run(argv, {
      fs: memoryFs(HEAD),
      cwd: '/w',
      out: (line) => out.push(line),
      err: () => undefined,
      snapshot: (): Promise<Snapshot> =>
        Promise.resolve({ commit: 'abc', fs: memoryFs(BASE), close: () => undefined }),
    });
    return { code, out: out.join('\n') };
  }

  it('annotates every finding of a scan, with paths from where it ran', async () => {
    const { code, out } = await capture(['scan', 'app', '--format=github']);
    expect(code).toBe(EXIT.OK);
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.includes('file=app/src/a.ts'))).toBe(true);
  });

  it('annotates only what a change introduced when comparing', async () => {
    const { out } = await capture(['scan', 'app', '--changed-since', 'main', '--format=github']);
    expect(out.split('\n')).toHaveLength(1);
    expect(out).toContain('Flag fresh has no owner');
  });

  it('fails check with annotations for the violations it would fail on', async () => {
    const all = await capture(['check', 'app', '--format=github']);
    expect(all.code).toBe(EXIT.POLICY);
    expect(all.out.split('\n')).toHaveLength(2);

    const since = await capture([
      'check',
      'app',
      '--changed-since',
      'main',
      '--format=codequality',
    ]);
    expect(since.code).toBe(EXIT.POLICY);
    const issues = JSON.parse(since.out) as { description: string }[];
    expect(issues.map((i) => i.description.split(' (')[0])).toEqual(['Flag fresh has no owner']);
  });
});
