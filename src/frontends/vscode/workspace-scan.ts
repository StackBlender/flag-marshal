/**
 * Running a scan from the extension host.
 *
 * Kept out of `extension.ts` because none of it needs the `vscode` module: it is
 * the same `openWorkspace` call the CLI makes, with the same Node adapters, so
 * the editor and the terminal cannot disagree about what a workspace contains.
 */

import { openWorkspace } from '../../core/api/index.js';
import type { ScanReport } from '../../core/api/index.js';
import { nodeFileSystem, nodeGitHistory } from '../node/index.js';

export interface ScanOptions {
  /** Absolute path to the workspace folder. */
  readonly root: string;
  /**
   * Git history supplies age evidence, and costs a `git log` per flag key. An
   * editor that rescans on every save cannot afford it on a large repository, so
   * the caller decides.
   */
  readonly useGit?: boolean;
}

export interface ScanOutcome {
  readonly report?: ScanReport;
  /**
   * Why the scan produced nothing. Reported rather than thrown: a folder that
   * cannot be read is a normal thing for an editor to be pointed at, and it must
   * not take the extension down.
   */
  readonly error?: string;
}

export async function scanWorkspace(options: ScanOptions): Promise<ScanOutcome> {
  try {
    const report = await openWorkspace({
      root: options.root,
      fs: nodeFileSystem,
      ...(options.useGit === false ? {} : { git: nodeGitHistory(options.root) }),
    }).scan();

    return { report };
  } catch (error) {
    return { error: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
