import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FileRevision, GitHistory, KeyHistory } from '../../core/api/index.js';

const run = promisify(execFile);

/**
 * Git history via the `git` binary.
 *
 * This lives in the frontend because the core does not spawn processes. Keys are
 * passed as argv entries, never interpolated into a shell command, so a flag key
 * containing shell metacharacters is inert.
 *
 * `git log -S<key>` is git's pickaxe: it finds commits that changed the number
 * of occurrences of a literal string. That is exactly "when did this flag key
 * appear, and when was it last touched", which file timestamps cannot answer —
 * a file edited yesterday may carry a flag added three years ago.
 */
export function nodeGitHistory(root: string, options: { timeoutMs?: number } = {}): GitHistory {
  const timeout = options.timeoutMs ?? 5_000;
  let available: Promise<boolean> | undefined;
  const cache = new Map<string, Promise<KeyHistory | undefined>>();

  const git = async (args: string[]): Promise<string> => {
    const { stdout } = await run('git', args, { cwd: root, timeout, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  };

  return {
    isAvailable(): Promise<boolean> {
      available ??= git(['rev-parse', '--is-inside-work-tree'])
        .then((out) => out.trim() === 'true')
        .catch(() => false);
      return available;
    },

    historyOf(key: string): Promise<KeyHistory | undefined> {
      let pending = cache.get(key);
      if (pending !== undefined) return pending;

      pending = (async (): Promise<KeyHistory | undefined> => {
        try {
          // `-S` takes the search string as its own argument; `--` ends option
          // parsing so a key beginning with a dash cannot become a flag.
          const stdout = await git(['log', '--format=%at', `-S${key}`, '--']);
          const times = stdout
            .split('\n')
            .map((line) => Number.parseInt(line.trim(), 10))
            .filter((n) => Number.isFinite(n));

          if (times.length === 0) return undefined;
          // git log is newest-first.
          return { firstSeen: times[times.length - 1] ?? 0, lastChanged: times[0] ?? 0 };
        } catch {
          // A shallow clone, a timeout, or a missing git binary all mean the same
          // thing to the engine: no history evidence. Confidence drops instead.
          return undefined;
        }
      })();

      cache.set(key, pending);
      return pending;
    },

    async revisionsOf(path: string): Promise<FileRevision[]> {
      try {
        const stdout = await git(['log', '--format=%H %at', '--', path]);
        return stdout
          .split('\n')
          .map((line) => line.trim().split(' '))
          .filter((parts): parts is [string, string] => parts.length === 2)
          .map(([commit, at]) => ({ commit, timestamp: Number.parseInt(at, 10) }))
          .filter((r) => Number.isFinite(r.timestamp));
      } catch {
        return [];
      }
    },

    async contentAt(commit: string, path: string): Promise<string | undefined> {
      try {
        return await git(['show', `${commit}:${path}`]);
      } catch {
        return undefined;
      }
    },
  };
}
