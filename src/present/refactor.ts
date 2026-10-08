import type { RefusalReason } from '../core/api/index.js';

/**
 * Why a refactor preview was refused, in words every frontend shares.
 *
 * Each says what blocked the preview and, where there is one, what would
 * unblock it, because a refusal with no way forward reads as a bug.
 */
const REFUSALS: Record<RefusalReason, string> = {
  'unknown-flag':
    'No flag with that key is in the inventory. Run "flag-marshal scan" to list them.',
  'unresolved-keys':
    'Some flag keys in this repository are computed, so a read of this flag could be hiding behind one. Declare the helpers that compute them, or resolve them, first.',
  'unparsed-languages':
    'This repository has source in a language Flag Marshal cannot read, which could read this flag unseen.',
  'not-code':
    'Configuration or a declaration also names this flag, and a code rewrite does not remove it.',
  'unsupported-language': 'Only TypeScript and JavaScript can be rewritten so far.',
  'unsupported-shape':
    'This read is not the whole condition of an if or a ?: (await, ! and parentheses are fine), so where its value goes cannot be followed exactly.',
  'shares-lines': 'This if shares a line with other code. Put it on lines of its own.',
  'unreadable-file': 'This file could not be read.',
  'rewrite-failed':
    'The rewritten file did not parse cleanly or still read the flag, so no diff is shown rather than one that could be wrong.',
};

export function refusalText(reason: RefusalReason): string {
  return REFUSALS[reason];
}
