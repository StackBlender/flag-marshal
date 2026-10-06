/**
 * The filesystem port.
 *
 * The core performs no workspace I/O of its own: a frontend supplies this, so
 * the same analysis runs against a real checkout from the CLI, against an
 * editor's in-memory buffers from a plugin, and against a synthetic tree in a
 * test — with no branching inside the engine.
 *
 * The one exception is grammar loading, which reads Flag Marshal's own bundled
 * WASM assets rather than anything belonging to the workspace.
 */
export interface DirectoryEntry {
  /** Entry name, not a path. */
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  /** True for symbolic links, which the walker does not follow. */
  readonly isSymbolicLink: boolean;
}

export interface FileSystem {
  /** Entries directly inside `path`. Order is irrelevant; the walker sorts. */
  readDirectory(path: string): Promise<DirectoryEntry[]>;
  /** UTF-8 contents of `path`. */
  readFile(path: string): Promise<string>;
}
