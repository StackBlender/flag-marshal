import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import type { DirectoryEntry, FileSystem } from '../../core/api/index.js';

const run = promisify(execFile);

/** A workspace as it was at one commit, readable through the filesystem port. */
export interface GitSnapshot {
  /** The commit the snapshot reads: the merge base of the requested ref and `HEAD`. */
  readonly commit: string;
  readonly fs: FileSystem;
  /** Stops the object reader. Safe to call more than once. */
  close(): void;
}

/** Why a snapshot could not be opened. Never carries file contents or flag keys. */
export class SnapshotError extends Error {}

/**
 * Opens the workspace at `root` as it was at the merge base of `ref` and `HEAD`.
 *
 * The merge base, not the tip of `ref`: a branch compared against a `main` that
 * has moved on would otherwise be credited with removing every flag `main` added
 * since the branch was cut. This is the comparison a pull request shows.
 *
 * Only tracked files exist in a snapshot, which is what a commit is. `root` may
 * be a subdirectory of the repository; the snapshot is then that subdirectory.
 * Symbolic links are reported as links, and submodules are left out because a
 * commit records only their pointer, not their files.
 */
export async function openGitSnapshot(root: string, ref: string): Promise<GitSnapshot> {
  const git = async (args: string[]): Promise<string> => {
    const { stdout } = await run('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
    return stdout;
  };

  try {
    await git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new SnapshotError('not inside a git repository');
  }

  let commit: string;
  try {
    // `--end-of-options` keeps a ref beginning with a dash from becoming a flag.
    const tip = (
      await git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
    ).trim();
    commit = (await git(['merge-base', tip, 'HEAD'])).trim();
  } catch {
    const shallow = await git(['rev-parse', '--is-shallow-repository'])
      .then((out) => out.trim() === 'true')
      .catch(() => false);
    throw new SnapshotError(
      shallow
        ? `no common history with '${ref}' in this shallow clone; fetch full history (for example fetch-depth: 0)`
        : `no common history with '${ref}'`,
    );
  }

  let listing: string;
  try {
    listing = await git(['ls-tree', '-r', '-z', commit]);
  } catch {
    throw new SnapshotError(`could not read the files at '${ref}'`);
  }
  const tree = buildTree(listing);
  const reader = new BlobReader(root);

  const relative = (path: string): string | undefined => {
    if (path === root) return '';
    return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
  };

  return {
    commit,
    close: () => reader.close(),
    fs: {
      readDirectory(path: string): Promise<DirectoryEntry[]> {
        const dir = tree.dirs.get(relative(path) ?? '\0');
        if (dir === undefined) return Promise.reject(new Error('ENOENT'));
        return Promise.resolve([...dir.values()]);
      },
      readFile(path: string): Promise<string> {
        const blob = tree.blobs.get(relative(path) ?? '\0');
        if (blob === undefined) return Promise.reject(new Error('ENOENT'));
        return reader.read(blob);
      },
    },
  };
}

interface Tree {
  /** Directory path ('' for the root) to its entries by name. */
  readonly dirs: Map<string, Map<string, DirectoryEntry>>;
  /** File path to blob id. Links are listed but never readable, like the walker wants. */
  readonly blobs: Map<string, string>;
}

/** Builds directories from `git ls-tree -r -z` output, which lists only files. */
function buildTree(listing: string): Tree {
  const dirs = new Map<string, Map<string, DirectoryEntry>>([['', new Map()]]);
  const blobs = new Map<string, string>();

  const add = (dir: string, entry: DirectoryEntry): void => {
    let entries = dirs.get(dir);
    if (entries === undefined) {
      entries = new Map();
      dirs.set(dir, entries);
    }
    entries.set(entry.name, entry);
  };

  for (const line of listing.split('\0')) {
    // `<mode> SP <type> SP <object> TAB <path>`
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const [mode, type, object] = line.slice(0, tab).split(' ');
    const path = line.slice(tab + 1);
    if (type !== 'blob' || object === undefined) continue;

    const isSymbolicLink = mode === '120000';
    if (!isSymbolicLink) blobs.set(path, object);

    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      const name = parts[i] ?? '';
      const isFile = i === parts.length - 1;
      add(parent, {
        name,
        isDirectory: !isFile,
        isFile: isFile && !isSymbolicLink,
        isSymbolicLink: isFile && isSymbolicLink,
      });
    }
  }
  return { dirs, blobs };
}

/**
 * Reads blobs through one long-lived `git cat-file --batch`.
 *
 * A process per file would cost a repository with thousands of files thousands
 * of spawns. Requests are answered in order, so they are queued and matched to
 * replies first in, first out.
 */
class BlobReader {
  private process: ChildProcessWithoutNullStreams | undefined;
  private buffer = Buffer.alloc(0);
  private readonly pending: { resolve: (text: string) => void; reject: (e: Error) => void }[] = [];

  constructor(private readonly root: string) {}

  read(object: string): Promise<string> {
    const child = this.start();
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      child.stdin.write(`${object}\n`);
    });
  }

  close(): void {
    this.process?.stdin.end();
    this.process = undefined;
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.process !== undefined) return this.process;
    const child = spawn('git', ['cat-file', '--batch'], { cwd: this.root });
    child.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    const fail = (): void => {
      for (const waiting of this.pending.splice(0))
        waiting.reject(new Error('git cat-file failed'));
      if (this.process === child) this.process = undefined;
    };
    child.on('error', fail);
    child.on('close', fail);
    this.process = child;
    return child;
  }

  /** Answers every complete reply in the buffer: `<oid> <type> <size>\n<bytes>\n`. */
  private drain(): void {
    for (;;) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline === -1) return;
      const header = this.buffer.subarray(0, newline).toString('utf8').split(' ');

      if (header[1] === 'missing' || header.length < 3) {
        this.buffer = this.buffer.subarray(newline + 1);
        this.pending.shift()?.reject(new Error('ENOENT'));
        continue;
      }

      const size = Number.parseInt(header[2] ?? '', 10);
      const end = newline + 1 + size;
      if (this.buffer.length < end + 1) return;
      const text = this.buffer.subarray(newline + 1, end).toString('utf8');
      this.buffer = this.buffer.subarray(end + 1);
      this.pending.shift()?.resolve(text);
    }
  }
}
