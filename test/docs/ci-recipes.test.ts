import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 * Hosted GitHub and GitLab runs need the user's repositories, so the closest
 * thing to a pipeline this suite can run is the built CLI in a real clone of a
 * real origin, with the variables each system sets, taking its commands from the
 * recipes themselves. This is what that run found: paths are relative to the
 * checkout root, `check` exits 2 only for what the change adds, and the report is
 * written even on exit 2 so GitLab's `artifacts: when: always` has a file.
 */
const ENTRY = resolve(import.meta.dirname, '../../dist/frontends/cli/main.js');
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'ci',
  GIT_AUTHOR_EMAIL: 'ci@example.invalid',
  GIT_COMMITTER_NAME: 'ci',
  GIT_COMMITTER_EMAIL: 'ci@example.invalid',
};
const CONFIG = (flags: Record<string, string>): string =>
  `policy:\n  requireOwner: true\nflags:\n${Object.entries(flags)
    .map(([key, owner]) => `  ${key}:\n    owner: ${owner}\n`)
    .join('')}`;
const CALL = (key: string): string =>
  `export const ${key.replace(/\W/g, '_')} = () => client.variation('${key}', { key: 'u' }, false);\n`;

/** The recipe's command line, with the published package swapped for the built CLI. */
function recipe(pattern: RegExp): string[] {
  const found = commands.find((c) => pattern.test(c));
  if (found === undefined) throw new Error(`no recipe matches ${pattern}`);
  return found.split(/\s+/);
}

describe('docs/ci.md in a real clone', () => {
  const dirs: string[] = [];
  let work = '';
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: work, env: GIT_ENV, encoding: 'utf8', stdio: 'pipe' });
  const pipeline = (argv: string[], env: Record<string, string>, cwd = work) =>
    spawnSync('node', [ENTRY, ...argv], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
  const commit = (message: string, files: Record<string, string>): void => {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(work, name), text);
    git('add', '--', ...Object.keys(files));
    git('commit', '-qm', message);
  };
  const github = { GITHUB_BASE_REF: 'main' };

  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), 'flag-marshal-ci-'));
    dirs.push(root);
    const origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    work = join(root, 'work');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: GIT_ENV });
    execFileSync('git', ['clone', '-q', origin, seed], { env: GIT_ENV, stdio: 'pipe' });
    work = seed;
    execFileSync('mkdir', ['-p', join(seed, 'src')]);
    commit('base', {
      'src/a.ts': `import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('k');\n${CALL('old-flag')}`,
      '.flagmarshal.yml': CONFIG({ 'old-flag': 'team-a' }),
    });
    git('push', '-q', 'origin', 'HEAD:main');
    // A pipeline starts from a fresh full clone of the origin.
    execFileSync('git', ['clone', '-q', origin, join(root, 'work')], {
      env: GIT_ENV,
      stdio: 'pipe',
    });
    work = join(root, 'work');
    git('checkout', '-q', '-b', 'feature');
  });

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('is built (run `npm run build` first)', () => {
    expect(spawnSync('node', [ENTRY, '--version']).status).toBe(0);
  });

  it('passes a change that adds nothing', () => {
    const result = pipeline(recipe(/--format=github/), github);
    expect(result.status).toBe(EXIT.OK);
    expect(result.stdout).not.toContain('::error');
    expect(result.stderr).toContain('comparing with origin/main (from GITHUB_BASE_REF)');
  });

  it("fails a change that adds a violation, in each system's format", () => {
    const src = readFileSync(join(work, 'src/a.ts'), 'utf8');
    commit('add a flag with no owner', { 'src/a.ts': src + CALL('new-flag') });
    const base = git('merge-base', 'origin/main', 'HEAD').trim();

    const annotated = pipeline(recipe(/--format=github/), github);
    expect(annotated.status).toBe(EXIT.POLICY);
    expect(annotated.stdout).toMatch(/^::error file=src\/a\.ts,line=4,.*new-flag/m);

    const gitlab = pipeline(recipe(/--format=codequality/), {
      CI_MERGE_REQUEST_DIFF_BASE_SHA: base,
    });
    expect(gitlab.status).toBe(EXIT.POLICY);
    expect(gitlab.stderr).toContain('CI_MERGE_REQUEST_DIFF_BASE_SHA');
    // The recipe redirects stdout into gl-code-quality.json; stderr stays out of it.
    const report = JSON.parse(gitlab.stdout) as {
      check_name: string;
      location: { path: string; lines: { begin: number } };
    }[];
    expect(report).toHaveLength(1);
    expect(report[0]?.location).toEqual({ path: 'src/a.ts', lines: { begin: 4 } });

    const summary = pipeline(['scan', '--changed-since=auto', '--format=markdown'], github);
    expect(summary.status).toBe(EXIT.OK);
    expect(summary.stdout).toContain(
      '| Flag new-flag has no owner | `new-flag` | high | `src/a.ts:4` |',
    );
  });

  it('does not apply the policy outside the repository root', () => {
    // Documented in docs/ci.md: the config is found from the working directory.
    const result = pipeline(recipe(/--format=github/), github, join(work, 'src'));
    expect(result.status).toBe(EXIT.OK);
  });

  it('passes once the violation is resolved, or the flag removed', () => {
    commit('declare the owner', {
      '.flagmarshal.yml': CONFIG({ 'old-flag': 'team-a', 'new-flag': 'team-b' }),
    });
    const resolved = pipeline(recipe(/--format=github/), github);
    expect(resolved.status).toBe(EXIT.OK);
    expect(resolved.stdout).not.toContain('::error');

    // GitLab's artifact is still written when clean: an empty report, not a missing file.
    const base = git('merge-base', 'origin/main', 'HEAD').trim();
    const gitlab = pipeline(recipe(/--format=codequality/), {
      CI_MERGE_REQUEST_DIFF_BASE_SHA: base,
    });
    expect(gitlab.status).toBe(EXIT.OK);
    expect(JSON.parse(gitlab.stdout)).toEqual([]);

    git('checkout', '-q', 'main');
    git('checkout', '-q', '-b', 'removal');
    commit('remove old-flag', {
      'src/a.ts':
        "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('k');\n",
    });
    expect(pipeline(recipe(/--format=github/), github).status).toBe(EXIT.OK);
  });

  it('exits 1, not 0, when the base is not in the clone', () => {
    const result = pipeline(recipe(/--format=github/), { GITHUB_BASE_REF: 'missing' });
    expect(result.status).toBe(EXIT.USAGE);
    expect(result.stderr).toContain('cannot compare');
  });
});
