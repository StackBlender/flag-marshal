import type {
  ChangeSet,
  Finding,
  FlagReference,
  ScanReport,
} from '../api/generated/scan-report.js';
import { violationKey } from '../policy/evaluate.js';

/** The commit a comparison was made against. */
export interface ComparisonBase {
  /** The ref as the user gave it. */
  readonly ref: string;
  /** The commit actually compared against. */
  readonly commit: string;
}

/**
 * What a change does to the flag inventory: `base` is the workspace before it,
 * `head` the workspace after.
 *
 * Both reports must be produced with the same git history and the same "now".
 * Then age-based findings agree on both sides, and every difference here comes
 * from the code that changed rather than from time passing.
 *
 * Identities ignore position, so moving code is not a change:
 * - a flag is its key;
 * - a finding is its rule and flag key, the same identity the baseline uses, so
 *   this and `check` agree on what one violation is;
 * - an unresolved reference is its file, provider and expression.
 *
 * Findings and unresolved references are compared as multisets. A second
 * computed key in a file that already had one is a new one, even though the two
 * look alike.
 */
export function compareReports(
  base: ScanReport,
  head: ScanReport,
  since: ComparisonBase,
): ChangeSet {
  const before = new Map(base.flags.map((flag) => [flag.key, flag.references.length]));
  const after = new Map(head.flags.map((flag) => [flag.key, flag.references.length]));

  const changedFlags: ChangeSet['changedFlags'] = [];
  for (const [key, referencesAfter] of after) {
    const referencesBefore = before.get(key);
    if (referencesBefore !== undefined && referencesBefore !== referencesAfter) {
      changedFlags.push({ key, referencesBefore, referencesAfter });
    }
  }

  return {
    since: { ref: since.ref, commit: since.commit },
    addedFlags: [...after.keys()].filter((key) => !before.has(key)).sort(),
    removedFlags: [...before.keys()].filter((key) => !after.has(key)).sort(),
    changedFlags: changedFlags.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    introducedFindings: surplus(head.findings, base.findings, violationKey),
    resolvedFindings: surplus(base.findings, head.findings, violationKey),
    introducedUnresolved: surplus(
      head.unresolvedReferences,
      base.unresolvedReferences,
      unresolvedKey,
    ),
    resolvedUnresolved: surplus(
      base.unresolvedReferences,
      head.unresolvedReferences,
      unresolvedKey,
    ),
  };
}

function unresolvedKey(ref: FlagReference): string {
  return `${ref.range.file}\0${ref.provider}\0${ref.expression ?? ''}`;
}

/**
 * Items of `from` beyond what `against` accounts for, in `from`'s order.
 *
 * With three alike items before and four after, the fourth is the new one; which
 * of the four is reported does not matter, because they are alike by identity.
 */
function surplus<T extends Finding | FlagReference>(
  from: readonly T[],
  against: readonly T[],
  identity: (item: T) => string,
): T[] {
  const available = new Map<string, number>();
  for (const item of against) {
    const key = identity(item);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const result: T[] = [];
  for (const item of from) {
    const key = identity(item);
    const left = available.get(key) ?? 0;
    if (left > 0) available.set(key, left - 1);
    else result.push(item);
  }
  return result;
}
