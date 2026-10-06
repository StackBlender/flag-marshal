import { describe, expect, it } from 'vitest';
import type { DirectoryEntry, FileSystem } from '../../src/core/api/index.js';
import { walk } from '../../src/core/workspace/walk.js';

function memoryFs(files: Record<string, string>, links: string[] = []): FileSystem {
  const linkSet = new Set(links);
  return {
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const out = new Map<string, DirectoryEntry>();
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf('/');
        const name = slash === -1 ? rest : rest.slice(0, slash);
        out.set(name, {
          name,
          isDirectory: slash !== -1,
          isFile: slash === -1,
          isSymbolicLink: linkSet.has(`${prefix}${name}`),
        });
      }
      if (out.size === 0) throw new Error(`ENOENT: ${path}`);
      return [...out.values()];
    },
    async readFile(path: string): Promise<string> {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
  };
}

async function collect(files: Record<string, string>, links: string[] = []): Promise<string[]> {
  const out: string[] = [];
  for await (const path of walk({ fs: memoryFs(files, links), root: '/w' })) out.push(path);
  return out;
}

describe('walk', () => {
  it('yields files in deterministic order', async () => {
    const files = { '/w/b.ts': '', '/w/a.ts': '', '/w/sub/c.ts': '' };
    expect(await collect(files)).toEqual(['a.ts', 'b.ts', 'sub/c.ts']);
    expect(await collect(files)).toEqual(await collect(files));
  });

  it('skips heavy and generated directories without being told', async () => {
    const found = await collect({
      '/w/src/a.ts': '',
      '/w/node_modules/pkg/index.ts': '',
      '/w/dist/a.js': '',
      '/w/target/x.class': '',
      '/w/.git/config': '',
    });
    expect(found).toEqual(['src/a.ts']);
  });

  it('honors a root .gitignore', async () => {
    const found = await collect({
      '/w/.gitignore': 'secret.ts\ngenerated/\n',
      '/w/secret.ts': '',
      '/w/keep.ts': '',
      '/w/generated/x.ts': '',
    });
    expect(found).toEqual(['.gitignore', 'keep.ts']);
  });

  it('scopes a nested .gitignore to its own subtree', async () => {
    // The classic bug: `notes.ts` in web/.gitignore must not silence
    // service/notes.ts. Patterns are relative to the file that declares them.
    const found = await collect({
      '/w/web/.gitignore': 'notes.ts\n',
      '/w/web/notes.ts': '',
      '/w/web/app.ts': '',
      '/w/service/notes.ts': '',
    });
    expect(found).toEqual(['service/notes.ts', 'web/.gitignore', 'web/app.ts']);
  });

  it('applies a root .gitignore to nested directories', async () => {
    const found = await collect({
      '/w/.gitignore': '*.log\n',
      '/w/a.log': '',
      '/w/deep/nested/b.log': '',
      '/w/deep/nested/c.ts': '',
    });
    expect(found).toEqual(['.gitignore', 'deep/nested/c.ts']);
  });

  it('never follows symbolic links', async () => {
    const found = await collect({ '/w/real.ts': '', '/w/link.ts': '', '/w/linkdir/inner.ts': '' }, [
      '/w/link.ts',
      '/w/linkdir',
    ]);
    expect(found).toEqual(['real.ts']);
  });

  it('continues past an unreadable directory', async () => {
    const fs = memoryFs({ '/w/good/a.ts': '', '/w/bad/b.ts': '' });
    const guarded: FileSystem = {
      readDirectory: (p) =>
        p.endsWith('/bad') ? Promise.reject(new Error('EACCES')) : fs.readDirectory(p),
      readFile: fs.readFile,
    };
    const out: string[] = [];
    for await (const path of walk({ fs: guarded, root: '/w' })) out.push(path);
    expect(out).toEqual(['good/a.ts']);
  });

  it('yields nothing for an empty workspace', async () => {
    const fs: FileSystem = {
      readDirectory: () => Promise.resolve([]),
      readFile: () => Promise.reject(new Error('ENOENT')),
    };
    const out: string[] = [];
    for await (const path of walk({ fs, root: '/w' })) out.push(path);
    expect(out).toEqual([]);
  });
});
