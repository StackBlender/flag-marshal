/**
 * The git-history port.
 *
 * Like the filesystem port, this keeps the core free of process spawning: a
 * frontend supplies it, so the engine stays testable against a synthetic history
 * and works unchanged in an editor that already has repository data in hand.
 *
 * Git history is the one evidence source a coding agent cannot cheaply
 * reproduce, and it is where "this flag has been permanently enabled for
 * eighteen months" comes from.
 */
export interface KeyHistory {
  /** Unix seconds of the earliest commit that added or removed the key. */
  readonly firstSeen: number;
  /** Unix seconds of the most recent commit that added or removed the key. */
  readonly lastChanged: number;
}

/** One commit that touched a tracked file. */
export interface FileRevision {
  readonly commit: string;
  /** Unix seconds. */
  readonly timestamp: number;
}

export interface GitHistory {
  /** False when the workspace is not a git repository, or git is unavailable. */
  isAvailable(): Promise<boolean>;
  /**
   * History of a literal string across the repository, or undefined when the key
   * cannot be traced. Implementations should treat `key` as a literal, never a
   * pattern.
   */
  historyOf(key: string): Promise<KeyHistory | undefined>;
  /**
   * Commits that changed `path`, newest first.
   *
   * This is what makes trend reporting possible without a hosted database: the
   * baseline file is committed alongside the code, so its own git history *is*
   * the record of how flag debt moved over time.
   */
  revisionsOf(path: string): Promise<FileRevision[]>;
  /** Contents of `path` at `commit`, or undefined if it did not exist then. */
  contentAt(commit: string, path: string): Promise<string | undefined>;
}

/** A history source that knows nothing, used when the workspace is not a repository. */
export const noGitHistory: GitHistory = {
  isAvailable: () => Promise.resolve(false),
  historyOf: () => Promise.resolve(undefined),
  revisionsOf: () => Promise.resolve([]),
  contentAt: () => Promise.resolve(undefined),
};
