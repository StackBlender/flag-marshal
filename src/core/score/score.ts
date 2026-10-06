import type { Confidence, Evidence } from '../api/generated/scan-report.js';
import { evidenceFlag, evidenceValue } from '../evidence/collect.js';

/** A flag permanently enabled for this long has almost certainly outlived its rollout. */
export const STALE_AGE_DAYS = 365;
/** Untouched for this long means nobody is iterating on it. */
export const DORMANT_DAYS = 180;

export interface ScoreInput {
  readonly evidence: readonly Evidence[];
  /** Extensions of flag-capable languages the scan could not read. */
  readonly unparsedLanguages: readonly string[];
  /** True when any flag key in the workspace could not be resolved. */
  readonly anyUnresolvedKeys: boolean;
  /** True when git history was unavailable for the workspace. */
  readonly gitUnavailable: boolean;
}

export interface Score {
  readonly debtScore: number;
  readonly confidence: Confidence;
}

/**
 * Turns evidence into a debt weight and a confidence.
 *
 * The two are deliberately separate. `debtScore` says how much this flag is
 * probably costing; `confidence` says how much the tool actually knows. A
 * high-scoring flag at `low` confidence is a lead to investigate, not a
 * conclusion — and the product must never blur the two, because a confident
 * wrong deletion is the failure that ends its credibility.
 */
export function scoreFlag(input: ScoreInput): Score {
  return { debtScore: debtScore(input.evidence), confidence: confidenceFor(input) };
}

function debtScore(evidence: readonly Evidence[]): number {
  let score = 0;

  const age = evidenceValue(evidence, 'age-since-introduced');
  if (age !== undefined) score += Math.min(age / STALE_AGE_DAYS, 3) * 30;

  const dormant = evidenceValue(evidence, 'time-since-last-modified');
  if (dormant !== undefined) score += Math.min(dormant / DORMANT_DAYS, 3) * 15;

  const spread = evidenceValue(evidence, 'module-spread');
  if (spread !== undefined && spread > 1) score += Math.min(spread, 5) * 5;

  if (evidenceFlag(evidence, 'test-only-references')) score += 20;
  if (evidenceFlag(evidence, 'absent-from-code')) score += 25;

  // A widely-referenced flag is expensive to remove but is not itself debt, so
  // reach reduces urgency rather than adding to it.
  const references = evidenceValue(evidence, 'reference-count') ?? 0;
  if (references > 10) score -= 10;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Confidence follows the rule in `docs/design.md` section 5: multiple
 * independent signals agreeing with nothing contradicting them earns `high`;
 * partial coverage caps at `medium`; a single weak signal is `low`; and when the
 * scan could not establish enough, the answer is `unknown` rather than a guess.
 */
function confidenceFor(input: ScoreInput): Confidence {
  // Coverage limits come first: they bound everything below them, because a
  // signal counted over a repository that was only half read is not independent
  // evidence of anything.
  const partialCoverage = input.unparsedLanguages.length > 0 || input.anyUnresolvedKeys;

  const signals = countSignals(input.evidence, input.gitUnavailable);
  if (signals === 0) return 'unknown';

  if (partialCoverage) return signals >= 2 ? 'low' : 'unknown';
  if (input.gitUnavailable) return signals >= 2 ? 'medium' : 'low';

  if (signals >= 3) return 'high';
  if (signals >= 2) return 'medium';
  return 'low';
}

/**
 * Counts independent signals that a flag is stale.
 *
 * Age and dormancy are treated as one signal, not two: a flag introduced long
 * ago and untouched since is a single observation about the same commit history,
 * and counting it twice would manufacture agreement that does not exist.
 */
function countSignals(evidence: readonly Evidence[], gitUnavailable: boolean): number {
  let signals = 0;

  if (!gitUnavailable) {
    const age = evidenceValue(evidence, 'age-since-introduced');
    const dormant = evidenceValue(evidence, 'time-since-last-modified');
    if (
      (age !== undefined && age >= STALE_AGE_DAYS) ||
      (dormant !== undefined && dormant >= DORMANT_DAYS)
    ) {
      signals += 1;
    }
  }

  if (evidenceFlag(evidence, 'test-only-references')) signals += 1;
  if (evidenceFlag(evidence, 'absent-from-code')) signals += 1;
  if (evidenceFlag(evidence, 'absent-from-configuration')) signals += 1;

  return signals;
}
