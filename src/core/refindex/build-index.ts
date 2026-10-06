import type { FlagRecord, FlagReference } from '../api/generated/scan-report.js';
import { sortReferences } from '../detect/scan-source.js';

export interface FlagIndex {
  /** One record per resolved flag key, ordered by key. */
  readonly flags: FlagRecord[];
  /**
   * References whose key could not be read statically. They belong to no record,
   * so they are surfaced here rather than dropped.
   */
  readonly unresolvedReferences: FlagReference[];
}

/**
 * Groups raw references into the flag inventory.
 *
 * The index is keyed by flag, not by file or language: one key evaluated from
 * TypeScript and Java in different modules is a single record with two
 * references. That is what makes module-spread evidence meaningful later.
 *
 * Record-level evidence, scoring, and confidence are deliberately absent — no
 * evidence has been collected at this stage, so every record's confidence is
 * `unknown`, which is the honest value rather than a placeholder. Findings carry
 * their own evidence and confidence from Milestone 4 onward; record-level
 * scoring arrives in Milestone 5.
 */
export function buildIndex(references: readonly FlagReference[]): FlagIndex {
  const byKey = new Map<string, FlagReference[]>();
  const unresolved: FlagReference[] = [];

  for (const ref of references) {
    if (ref.resolution === 'unresolved' || ref.key === null) {
      unresolved.push(ref);
      continue;
    }
    const existing = byKey.get(ref.key);
    if (existing === undefined) byKey.set(ref.key, [ref]);
    else existing.push(ref);
  }

  const flags = [...byKey.keys()].sort().map((key) => {
    const references = sortReferences(byKey.get(key) ?? []);
    return {
      key,
      references,
      // Derived, never passed in: a flag is configured when some reference to it
      // came from a configuration source.
      inConfiguration: references.some((ref) => ref.kind === 'configuration'),
      evidence: [],
      confidence: 'unknown' as const,
    };
  });

  return { flags, unresolvedReferences: sortReferences(unresolved) };
}
