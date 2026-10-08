import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { noGitHistory } from '../../src/core/api/index.js';
import { EXIT, pullRequestBase, run, type Snapshot } from '../../src/frontends/cli/cli.js';
import {
  isShallowRepository,
  nodeGitHistory,
  openGitSnapshot,
} from '../../src/frontends/node/index.js';
import { memoryFs } from '../fakes/memory-fs.js';

describe('pullRequestBase', () => {
  it('reads each CI system, preferring the exact merge base GitLab provides', () => {
    expect(pullRequestBase({ GITHUB_BASE_REF: 'main' })).toEqual({
      ref: 'origin/main',
      variable: 'GITHUB_BASE_REF',
    });
    expect(pullRequestBase({ CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'develop' })?.ref).toBe(
      'origin/develop',
    );
    expect(
      pullRequestBase({
        CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'develop',
        CI_MERGE_REQUEST_DIFF_BASE_SHA: 'abc123',
      })?.ref,
    ).toBe('abc123');
    expect(pullRequestBase({ BITBUCKET_PR_DESTINATION_BRANCH: 'main' })?.ref).toBe('origin/main');
    expect(pullRequestBase({ SYSTEM_PULLREQUEST_TARGETBRANCH: 'refs/heads/release/2' })?.ref).toBe(
      'origin/release/2',
    );
  });

  it('finds nothing outside a pull request, including in a push build', () => {
    expect(pullRequestBase({})).toBeUndefined();
    // GitHub sets GITHUB_BASE_REF to an empty string on push events.
    expect(pullRequestBase({ GITHUB_BASE_REF: '', GITHUB_REF: 'refs/heads/main' })).toBeUndefined();
  });
});

describe('--changed-since=auto', () => {
  async function capture(argv: string[], env: Record<string, string>) {
    const err: string[] = [];
    const requested: string[] = [];
    const code = await run(argv, {
      fs: memoryFs({ '/w/a.ts': 'export const a = 1;\n' }),
      cwd: '/w',
      env,
      out: () => undefined,
      err: (line) => err.push(line),
      snapshot: (_root, ref): Promise<Snapshot> => {
        requested.push(ref);
        return Promise.resolve({
          commit: 'abc',
          fs: memoryFs({ '/w/a.ts': '' }),
          close: () => undefined,
        });
      },
    });
    return { code, err: err.join('\n'), requested };
  }

  it('compares with the pull request base and says where it came from', async () => {
    for (const command of ['scan', 'check']) {
      const { code, err, requested } = await capture([command, '--changed-since=auto'], {
        GITHUB_BASE_REF: 'main',
      });
      expect(code).toBe(EXIT.OK);
      expect(requested).toEqual(['origin/main']);
      expect(err).toBe('flag-marshal: comparing with origin/main (from GITHUB_BASE_REF)');
    }
  });

  it('is a usage error outside a pull request, never a guess', async () => {
    const { code, err, requested } = await capture(['check', '--changed-since', 'auto'], {});
    expect(code).toBe(EXIT.USAGE);
    expect(requested).toEqual([]);
    expect(err).toContain('found no pull request base in the environment');
  });
});

describe('shallow clones', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };

  /** A two-commit repository and a depth-1 clone of it. */
  function shallowPair(): { full: string; shallow: string } {
    const full = mkdtempSync(join(tmpdir(), 'flag-marshal-full-'));
    const parent = mkdtempSync(join(tmpdir(), 'flag-marshal-shallow-'));
    made.push(full, parent);
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, env: ENV, stdio: 'pipe' });
    git(full, 'init', '-q', '-b', 'main');
    writeFileSync(join(full, 'a.ts'), 'one\n');
    git(full, 'add', '.');
    git(full, 'commit', '-qm', 'one');
    writeFileSync(join(full, 'a.ts'), 'two\n');
    git(full, 'commit', '-qam', 'two');
    const shallow = join(parent, 'clone');
    git(parent, 'clone', '-q', '--depth', '1', `file://${full}`, shallow);
    return { full, shallow };
  }

  it('count as having no history, so no age is reported from a truncated log', async () => {
    const { full, shallow } = shallowPair();
    expect(await isShallowRepository(shallow)).toBe(true);
    expect(await isShallowRepository(full)).toBe(false);
    expect(await nodeGitHistory(shallow).isAvailable()).toBe(false);
    expect(await nodeGitHistory(full).isAvailable()).toBe(true);
  });

  it('say why a comparison failed when the base was never fetched', async () => {
    const { shallow } = shallowPair();
    await expect(openGitSnapshot(shallow, 'HEAD~1')).rejects.toThrow('in this shallow clone');
  });

  it('get a warning on stderr, except when history was not asked for', async () => {
    const warnings = async (argv: string[]) => {
      const err: string[] = [];
      await run(argv, {
        fs: memoryFs({ '/w/a.ts': 'export const a = 1;\n' }),
        cwd: '/w',
        git: () => noGitHistory,
        shallow: () => Promise.resolve(true),
        out: () => undefined,
        err: (line) => err.push(line),
      });
      return err.join('\n');
    };
    expect(await warnings(['scan'])).toContain(
      'this is a shallow clone, so flag age and staleness',
    );
    expect(await warnings(['check'])).toContain('fetch-depth: 0');
    expect(await warnings(['trend'])).toContain('the trend covers only the history it fetched');
    expect(await warnings(['scan', '--no-git'])).toBe('');
  });
});
