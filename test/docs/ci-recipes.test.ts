import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import type { Baseline } from '../../src/core/api/index.js';
import { EXIT, run, type Snapshot } from '../../src/frontends/cli/cli.js';
import { memoryFs } from '../fakes/memory-fs.js';

/**
 * The CI recipes are copied into real pipelines, so a recipe that stops working
 * fails someone else's build. These tests keep every YAML block parseable and
 * every Flag Marshal command in them valid for the CLI as it is now.
 */
const DOC = readFileSync(resolve(import.meta.dirname, '../../docs/ci.md'), 'utf8');

const blocks = [...DOC.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({
  lang: m[1] ?? '',
  body: m[2] ?? '',
}));

/** Every `flag-marshal` invocation, with shell redirection and chaining cut off. */
const commands = blocks
  .filter((b) => b.lang === 'yaml' || b.lang === 'sh')
  .flatMap((b) => [...b.body.matchAll(/@stackblender\/flag-marshal(?:@[\w.]+)? ([^\n]+)/g)])
  .map((m) => (m[1] ?? '').split(/ (?:>>?|\||&&) /)[0]?.trim() ?? '');

describe('docs/ci.md', () => {
  it('has YAML and shell recipes to check', () => {
    expect(blocks.filter((b) => b.lang === 'yaml').length).toBeGreaterThanOrEqual(4);
    expect(commands.length).toBeGreaterThanOrEqual(6);
  });

  it('has YAML that parses', () => {
    for (const block of blocks.filter((b) => b.lang === 'yaml')) {
      const doc = parseDocument(block.body);
      expect(
        doc.errors.map((e) => e.message),
        block.body,
      ).toEqual([]);
    }
  });

  it('pins the published package by name', () => {
    const named = [...DOC.matchAll(/npx --yes (\S+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((name) => name?.startsWith('@stackblender/flag-marshal@'))).toBe(true);
  });

  it('uses only commands and options the CLI accepts', async () => {
    for (const command of commands) {
      let stored: Baseline | undefined;
      const err: string[] = [];
      const code = await run(command.split(/\s+/), {
        fs: memoryFs({ '/w/src/a.ts': 'export const a = 1;\n' }),
        cwd: '/w',
        env: { GITHUB_BASE_REF: 'main' },
        out: () => undefined,
        err: (line) => err.push(line),
        snapshot: (): Promise<Snapshot> =>
          Promise.resolve({
            commit: 'abc',
            fs: memoryFs({ '/w/src/a.ts': '' }),
            close: () => undefined,
          }),
        baselines: {
          read: () => Promise.resolve(stored),
          write: (_root, baseline) => {
            stored = baseline;
            return Promise.resolve();
          },
        },
      });
      expect(code, `${command}\n${err.join('\n')}`).not.toBe(EXIT.USAGE);
    }
  });
});

/**
 * Runs a documented script line exactly as written, through a shell, in a fresh
 * git repository. Only `npx --yes <package>` is intercepted: a shim on PATH
 * swaps it for the built CLI, since the published package is not installable here.
 */
const ENTRY = resolve(import.meta.dirname, '../../dist/frontends/cli/main.js');
const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function runRecipeLine(line: string, env: Record<string, string> = {}): string {
  expect(existsSync(ENTRY), `missing ${ENTRY} (run \`npm run build\` first)`).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), 'fm-recipe-'));
  scratch.push(dir);
  const bin = mkdtempSync(join(tmpdir(), 'fm-shim-'));
  scratch.push(bin);
  writeFileSync(
    join(bin, 'npx'),
    `#!/bin/sh\nshift 2\nexec node "${ENTRY}" "$@"\n`, // drops: --yes <package>
  );
  chmodSync(join(bin, 'npx'), 0o755);
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q');
  const commit = (message: string): void => {
    git('add', '.');
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@x.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      message,
    );
  };
  commit('base');
  const base = git('rev-parse', 'HEAD');
  // The change under test adds an ownerless flag, which the policy rejects.
  writeFileSync(join(dir, '.flagmarshal.yml'), 'policy:\n  requireOwner: true\n');
  writeFileSync(
    join(dir, 'app.ts'),
    [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "const client = init('k');",
      'export async function f(): Promise<boolean> {',
      "  return client.variation('new-checkout', { key: 'u' }, false);",
      '}',
      '',
    ].join('\n'),
  );
  commit('add flag');
  try {
    execFileSync('sh', ['-c', line], {
      cwd: dir,
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env['PATH'] ?? ''}`,
        CI_MERGE_REQUEST_DIFF_BASE_SHA: base,
        ...env,
      },
    });
  } catch (error) {
    // `check` exits 2 on violations; the artifact is still uploaded (when: always).
    const status = (error as { status?: number }).status;
    if (status !== 2) throw error;
  }
  return dir;
}

describe('docs/ci.md recipes that write a file', () => {
  it('GitLab writes the Code Quality file where artifacts:reports:codequality reads it', () => {
    const block = blocks.find((b) => b.lang === 'yaml' && b.body.includes('codequality:'));
    const job = (Object.values(parseDocument(block?.body ?? '').toJS() as object)[0] ?? {}) as {
      script: string[];
      artifacts: { reports: { codequality: string } };
    };
    const reportPath = job.artifacts.reports.codequality;
    const line = job.script.find((l) => l.includes('--format=codequality')) ?? '';
    expect(line).toContain(`> ${reportPath}`);

    const dir = runRecipeLine(line);
    const file = join(dir, reportPath);
    expect(existsSync(file), `${reportPath} was not written`).toBe(true);
    const issues = JSON.parse(readFileSync(file, 'utf8')) as Array<{
      description: unknown;
      check_name: unknown;
      fingerprint: unknown;
      severity: unknown;
      location: { path: unknown; lines: { begin: unknown } };
    }>;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(typeof issue.description).toBe('string');
      expect(typeof issue.check_name).toBe('string');
      expect(typeof issue.fingerprint).toBe('string');
      expect(typeof issue.severity).toBe('string');
      expect(typeof issue.location.path).toBe('string');
      expect(typeof issue.location.lines.begin).toBe('number');
    }
  });

  it('GitHub writes the SARIF file the upload step names', () => {
    const line = /run: (npx[^\n]*--format=sarif > (\S+))/.exec(DOC);
    expect(line).not.toBeNull();
    expect(DOC).toContain(`sarif_file: ${line?.[2]}`);
    const dir = runRecipeLine(line?.[1] ?? '');
    const sarif = JSON.parse(readFileSync(join(dir, line?.[2] ?? ''), 'utf8')) as {
      version: string;
      runs: unknown[];
    };
    expect(sarif.version).toBe('2.1.0');
    expect(Array.isArray(sarif.runs)).toBe(true);
  });

  it('GitHub appends the Markdown summary to the step summary file', () => {
    const line = /run: (npx[^\n]*--format=markdown >> "\$GITHUB_STEP_SUMMARY")/.exec(DOC);
    expect(line).not.toBeNull();
    const dir = runRecipeLine(line?.[1] ?? '', { GITHUB_STEP_SUMMARY: 'step-summary.md' });
    const file = join(dir, 'step-summary.md');
    expect(existsSync(file), 'step summary was not written').toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toMatch(/^#/m);
  });

  it('check --update-baseline writes the committed baseline file', () => {
    const line = /^(npx --yes \S+ check --update-baseline)$/m.exec(DOC);
    expect(line).not.toBeNull();
    const dir = runRecipeLine(line?.[1] ?? '');
    const file = join(dir, '.flagmarshal-baseline.json');
    expect(existsSync(file), 'baseline was not written').toBe(true);
    const baseline = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(typeof baseline).toBe('object');
    expect(Object.keys(baseline).length).toBeGreaterThan(0);
  });
});
