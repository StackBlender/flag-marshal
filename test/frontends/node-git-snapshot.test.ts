import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScanReport } from '../../src/core/api/index.js';
import { run } from '../../src/frontends/cli/cli.js';
import { nodeFileSystem, openGitSnapshot, SnapshotError } from '../../src/frontends/node/index.js';

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
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: tmpdir(),
};

function repo(): {
  dir: string;
  git: (...args: string[]) => string;
  write: (p: string, t: string) => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'flag-marshal-snapshot-'));
  made.push(dir);
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8' });
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  git('init', '-q', '-b', 'main');
  return { dir, git, write };
}

const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\n";

describe('openGitSnapshot', () => {
  it('reads files as they were at the merge base, not the tip of the ref', async () => {
    const { dir, git, write } = repo();
    write('src/a.ts', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'feature');
    write('src/a.ts', 'feature\n');
    git('commit', '-qam', 'feature');
    git('checkout', '-q', 'main');
    write('src/a.ts', 'main moved on\n');
    write('src/new.ts', 'only on main\n');
    git('add', '.');
    git('commit', '-qm', 'main');
    git('checkout', '-q', 'feature');

    const snapshot = await openGitSnapshot(dir, 'main');
    try {
      expect(snapshot.commit).toBe(git('rev-parse', 'HEAD~1').trim());
      expect(await snapshot.fs.readFile(`${dir}/src/a.ts`)).toBe('base\n');
      await expect(snapshot.fs.readFile(`${dir}/src/new.ts`)).rejects.toThrow();
    } finally {
      snapshot.close();
    }
  });

  it('lists directories, reports links as links, and reads only inside the root', async () => {
    const { dir, git, write } = repo();
    write('app/src/a.ts', 'a\n');
    write('app/README', 'r\n');
    write('elsewhere.ts', 'outside\n');
    symlinkSync('src/a.ts', join(dir, 'app/link.ts'));
    git('add', '.');
    git('commit', '-qm', 'base');

    const root = `${dir}/app`;
    const snapshot = await openGitSnapshot(root, 'HEAD');
    try {
      const entries = await snapshot.fs.readDirectory(root);
      const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
      expect(Object.keys(byName).sort()).toEqual(['README', 'link.ts', 'src']);
      expect(byName['src']).toMatchObject({ isDirectory: true, isFile: false });
      expect(byName['link.ts']).toMatchObject({ isSymbolicLink: true, isFile: false });
      await expect(snapshot.fs.readFile(`${root}/link.ts`)).rejects.toThrow();
      await expect(snapshot.fs.readFile(`${dir}/elsewhere.ts`)).rejects.toThrow();
      await expect(snapshot.fs.readDirectory(`${root}/missing`)).rejects.toThrow();
    } finally {
      snapshot.close();
    }
  });

  it('answers many concurrent reads, including large and multi-byte files, in the right order', async () => {
    const { dir, git, write } = repo();
    const large = `${'ü€𝄞 '.repeat(60_000)}\n`;
    const files: Record<string, string> = { 'large.txt': large, 'empty.txt': '' };
    for (let i = 0; i < 50; i++) files[`f${i}.txt`] = `file ${i} ✓\n`;
    for (const [path, text] of Object.entries(files)) write(path, text);
    git('add', '.');
    git('commit', '-qm', 'base');

    const snapshot = await openGitSnapshot(dir, 'HEAD');
    try {
      const paths = Object.keys(files);
      const texts = await Promise.all(paths.map((p) => snapshot.fs.readFile(`${dir}/${p}`)));
      expect(texts).toEqual(paths.map((p) => files[p]));
    } finally {
      snapshot.close();
    }
  });

  it('refuses an unknown ref, a ref that looks like an option, and a directory outside git', async () => {
    const { dir, git, write } = repo();
    write('a.ts', 'a\n');
    git('add', '.');
    git('commit', '-qm', 'base');

    await expect(openGitSnapshot(dir, 'no-such-branch')).rejects.toThrow(SnapshotError);
    await expect(openGitSnapshot(dir, '--output=/tmp/x')).rejects.toThrow(SnapshotError);

    const plain = mkdtempSync(join(tmpdir(), 'flag-marshal-plain-'));
    made.push(plain);
    await expect(openGitSnapshot(plain, 'HEAD')).rejects.toThrow('not inside a git repository');
  });
});

describe('scan --changed-since against a real repository', () => {
  it('compares the working tree, uncommitted edits included, with the merge base', async () => {
    const { dir, git, write } = repo();
    write('src/a.ts', `${LD}client.variation('legacy-export', {}, false);\n`);
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'feature');
    // Not committed: a developer checking their own work before pushing.
    write('src/a.ts', `${LD}client.variation('checkout-v3', {}, false);\n`);

    const out: string[] = [];
    const code = await run(['scan', '--changed-since', 'main', '--json', '--no-git'], {
      fs: nodeFileSystem,
      snapshot: openGitSnapshot,
      cwd: dir,
      out: (line) => out.push(line),
      err: () => undefined,
    });
    const report = JSON.parse(out.join('\n')) as ScanReport;

    expect(code).toBe(0);
    expect(report.changes?.addedFlags).toEqual(['checkout-v3']);
    expect(report.changes?.removedFlags).toEqual(['legacy-export']);
  });
});
