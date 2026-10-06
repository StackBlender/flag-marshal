import ignore, { type Ignore } from 'ignore';
import type { FileSystem } from '../api/filesystem.js';

/**
 * Directories skipped before `.gitignore` is even consulted.
 *
 * Every one of these is either enormous, machine-generated, or not source. A
 * scan that descends into `node_modules` reports thousands of flags belonging to
 * other people's code, which is worse than reporting none.
 */
const ALWAYS_SKIP = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.gradle',
  '.idea',
  '.venv',
  'venv',
  '__pycache__',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
]);

export interface WalkOptions {
  readonly fs: FileSystem;
  /** Absolute path of the workspace root. */
  readonly root: string;
}

/**
 * A `.gitignore` file together with the directory it governs.
 *
 * Patterns in a nested ignore file are relative to *that* directory, not to the
 * workspace root. Adding `foo.txt` from `sub/.gitignore` to a root-relative
 * matcher would wrongly ignore `foo.txt` everywhere, so each matcher is tested
 * against the path made relative to its own base.
 */
interface ScopedIgnore {
  /** Workspace-relative directory owning this file, '' for the root. */
  readonly base: string;
  readonly matcher: Ignore;
}

/**
 * Yields workspace-relative paths of candidate files, in deterministic order.
 *
 * `.gitignore` is honored, accumulating as the walk descends so nested ignore
 * files apply to their own subtree — matching git's behavior. A scanner that
 * reports on ignored build output is reporting on files the team has already
 * declared uninteresting.
 *
 * Symbolic links are never followed: a link pointing outside the workspace, or
 * back into it, turns a walk into an infinite one.
 */
export async function* walk(options: WalkOptions): AsyncGenerator<string> {
  yield* descend(options.fs, options.root, '', []);
}

async function* descend(
  fs: FileSystem,
  root: string,
  relative: string,
  inherited: readonly ScopedIgnore[],
): AsyncGenerator<string> {
  const absolute = relative === '' ? root : `${root}/${relative}`;

  let entries;
  try {
    entries = await fs.readDirectory(absolute);
  } catch {
    // An unreadable directory is not a reason to abandon the whole scan.
    return;
  }

  const scopes = await withLocalIgnore(fs, absolute, relative, inherited);
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of sorted) {
    if (entry.isSymbolicLink) continue;

    const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;

    if (entry.isDirectory) {
      if (ALWAYS_SKIP.has(entry.name)) continue;
      if (isIgnored(scopes, `${childRelative}/`)) continue;
      yield* descend(fs, root, childRelative, scopes);
      continue;
    }

    if (!entry.isFile) continue;
    if (isIgnored(scopes, childRelative)) continue;
    yield childRelative;
  }
}

async function withLocalIgnore(
  fs: FileSystem,
  absolute: string,
  relative: string,
  inherited: readonly ScopedIgnore[],
): Promise<readonly ScopedIgnore[]> {
  let contents: string;
  try {
    contents = await fs.readFile(`${absolute}/.gitignore`);
  } catch {
    return inherited;
  }
  return [...inherited, { base: relative, matcher: ignore().add(contents) }];
}

/** True when any scope ignores `path`, tested relative to that scope's base. */
function isIgnored(scopes: readonly ScopedIgnore[], path: string): boolean {
  for (const scope of scopes) {
    const scoped = scope.base === '' ? path : path.slice(scope.base.length + 1);
    // A path outside this scope cannot be governed by it.
    if (scope.base !== '' && !path.startsWith(`${scope.base}/`)) continue;
    if (scoped !== '' && scope.matcher.ignores(scoped)) return true;
  }
  return false;
}
