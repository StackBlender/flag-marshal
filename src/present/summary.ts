import {
  DORMANT_DAYS,
  STALE_AGE_DAYS,
  type FlagRecord,
  type ScanReport,
} from '../core/api/index.js';
import { ageLabel, count } from './index.js';

/**
 * The numbers a developer forwards.
 *
 * An alphabetical inventory answers "what flags exist"; nobody forwards that. The
 * question a lead acts on is "how much of this is debt", so the summary counts
 * the flags that local evidence says are old, unread, or scaffolding — each one
 * backed by an evidence item on the flag, never inferred here.
 */
export interface ScanSummary {
  readonly flags: number;
  /** Introduced at least `STALE_AGE_DAYS` ago. Zero when git history was unavailable. */
  readonly olderThanAYear: number;
  /** Configured or declared, but no code reads it. */
  readonly neverRead: number;
  /** Every code reference is in test sources. */
  readonly testOnly: number;
  /** Call sites whose key is computed and could not be read. */
  readonly unresolved: number;
}

export function summarize(report: ScanReport): ScanSummary {
  const has = (flag: FlagRecord, kind: string) =>
    flag.evidence.some((item) => item.kind === kind && item.detail === true);
  return {
    flags: report.flags.length,
    olderThanAYear: report.flags.filter((flag) => (ageDays(flag) ?? 0) >= STALE_AGE_DAYS).length,
    neverRead: report.flags.filter((flag) => has(flag, 'absent-from-code')).length,
    testOnly: report.flags.filter((flag) => has(flag, 'test-only-references')).length,
    unresolved: report.unresolvedReferences.length,
  };
}

/**
 * The summary as short phrases, zero counts omitted. An empty list means there
 * is nothing worth a headline, and the frontend should print none.
 */
export function headlineParts(summary: ScanSummary): string[] {
  const parts: string[] = [];
  if (summary.olderThanAYear > 0) parts.push(`${summary.olderThanAYear} older than a year`);
  if (summary.neverRead > 0) parts.push(`${summary.neverRead} never read by code`);
  if (summary.testOnly > 0) parts.push(`${summary.testOnly} read only by tests`);
  if (summary.unresolved > 0) parts.push(`${count(summary.unresolved, 'unresolved key')}`);
  return parts;
}

/**
 * Flags ordered by debt score, highest first, ties broken by key so the order is
 * deterministic.
 *
 * Only flags with a reason from `debtReasons` are ranked. Module spread adds to
 * the score because it makes removal expensive, but a young, well-used flag
 * spanning two modules is not debt, and ranking it would put noise at the top.
 *
 * A rank is a lead to review, never a verdict: it is not confidence, and nothing
 * here says a flag is safe to remove.
 */
export function rankByDebt(report: ScanReport, limit: number): FlagRecord[] {
  return report.flags
    .filter((flag) => (flag.debtScore ?? 0) > 0 && debtReasons(flag).length > 0)
    .sort((a, b) => (b.debtScore ?? 0) - (a.debtScore ?? 0) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * Why a flag ranks, as short phrases read from its own evidence. Each one is an
 * independent observation; an empty list means the flag carries no debt signal.
 */
export function debtReasons(flag: FlagRecord): string[] {
  const reasons: string[] = [];
  const age = ageDays(flag);
  if (age !== undefined && age >= STALE_AGE_DAYS) reasons.push(`introduced ${ageLabel(age)} ago`);
  const has = (kind: string) =>
    flag.evidence.some((item) => item.kind === kind && item.detail === true);
  if (has('absent-from-code')) reasons.push('never read by code');
  if (has('test-only-references')) reasons.push('read only by tests');
  if (has('absent-from-configuration')) reasons.push('not configured');
  const dormant = flag.evidence.find((item) => item.kind === 'time-since-last-modified')?.detail;
  if (typeof dormant === 'number' && dormant >= DORMANT_DAYS) {
    reasons.push(`unchanged for ${ageLabel(dormant)}`);
  }
  return reasons;
}

function ageDays(flag: FlagRecord): number | undefined {
  const detail = flag.evidence.find((item) => item.kind === 'age-since-introduced')?.detail;
  return typeof detail === 'number' ? detail : undefined;
}

/**
 * Functions that pass an unresolved key straight through, deduplicated and
 * sorted. Each is very likely the team's own flag helper, and naming it turns
 * "declare your helper" into a line the user can paste.
 */
export function helperCandidates(report: ScanReport): string[] {
  const names = report.unresolvedReferences.flatMap((ref) =>
    ref.helperCandidate === undefined ? [] : [ref.helperCandidate],
  );
  return [...new Set(names)].sort();
}
