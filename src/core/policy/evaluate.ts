import type { Finding, FlagRecord } from '../api/generated/scan-report.js';
import type { FlagMetadata, Policy } from '../config/settings.js';

export interface PolicyInput {
  readonly flags: readonly FlagRecord[];
  readonly policy: Policy;
  /** Declared metadata per flag, manifest merged over inline directives. */
  readonly metadata: Readonly<Record<string, FlagMetadata>>;
  /** Unix seconds treated as "now". */
  readonly now: number;
}

const SECONDS_PER_DAY = 86_400;

/**
 * Evaluates repository policy.
 *
 * Policy findings are separate from drift findings on purpose. A drift finding
 * says "this flag looks dead" and carries a graded confidence, because the tool
 * is inferring. A policy finding says "this flag has no owner", which is a fact
 * about the repository and is therefore always `high` confidence — the team
 * either declared an owner or did not.
 */
export function evaluatePolicy(input: PolicyInput): Finding[] {
  const { policy, metadata, now } = input;
  const allowlist = new Set(policy.allowlist);
  const findings: Finding[] = [];

  // Kill switches and licensing gates legitimately live forever. A tool that
  // cannot express that gets switched off entirely.
  const governed = input.flags.filter((flag) => !allowlist.has(flag.key));

  for (const flag of governed) {
    const declared = metadata[flag.key] ?? {};
    const range = flag.references[0]?.range;
    const anchor = range === undefined ? {} : { range };

    if (policy.requireOwner && declared.owner === undefined) {
      findings.push({
        id: 'flag.missing-owner',
        flagKey: flag.key,
        severity: 'error',
        confidence: 'high',
        evidence: [{ kind: 'declared-owner', detail: false }],
        ...anchor,
      });
    }

    if (policy.requireExpiry && declared.expiry === undefined) {
      findings.push({
        id: 'flag.missing-expiry',
        flagKey: flag.key,
        severity: 'error',
        confidence: 'high',
        evidence: [{ kind: 'declared-expiry', detail: false }],
        ...anchor,
      });
    }

    if (declared.expiry !== undefined) {
      const overdue = daysOverdue(declared.expiry, now);
      if (overdue > 0) {
        findings.push({
          id: 'flag.expired',
          flagKey: flag.key,
          severity: 'error',
          confidence: 'high',
          evidence: [
            { kind: 'declared-expiry', detail: declared.expiry },
            { kind: 'age-since-introduced', detail: overdue },
          ],
          ...anchor,
        });
      }
    }
  }

  if (policy.budget > 0 && governed.length > policy.budget) {
    findings.push({
      id: 'flag.budget-exceeded',
      flagKey: null,
      severity: 'error',
      confidence: 'high',
      evidence: [
        { kind: 'flag-count', detail: governed.length },
        { kind: 'budget', detail: policy.budget },
      ],
    });
  }

  return findings.sort((a, b) => {
    const ka = a.flagKey ?? '';
    const kb = b.flagKey ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * A stable identity for one violation, used to baseline existing debt.
 *
 * Deliberately excludes file position: moving a flag to another line is not a new
 * violation, and a baseline that churned on every refactor would be abandoned
 * within a week.
 */
export function violationKey(finding: Finding): string {
  return `${finding.id}:${finding.flagKey ?? '*'}`;
}

export interface Baseline {
  readonly version: 1;
  /** Violation keys accepted as pre-existing debt, sorted. */
  readonly accepted: readonly string[];
}

export interface RatchetResult {
  /** Violations not present in the baseline. These fail the build. */
  readonly introduced: Finding[];
  /** Violations the baseline still covers. These are the debt being burned down. */
  readonly accepted: Finding[];
  /** Baselined violations that no longer occur — debt that was paid off. */
  readonly resolved: string[];
}

/**
 * Applies the baseline ratchet.
 *
 * This is the single most important adoption mechanic in the product. No team
 * adopts a CI check that fails on day one with two hundred pre-existing
 * violations; they disable it and never come back. The first run records what
 * exists, and CI then fails only on violations that are genuinely new, so debt
 * can hold steady or fall but never rise.
 */
export function applyRatchet(
  findings: readonly Finding[],
  baseline: Baseline | undefined,
): RatchetResult {
  if (baseline === undefined) {
    return { introduced: [...findings], accepted: [], resolved: [] };
  }

  const accepted = new Set(baseline.accepted);
  const introduced: Finding[] = [];
  const carried: Finding[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const key = violationKey(finding);
    seen.add(key);
    if (accepted.has(key)) carried.push(finding);
    else introduced.push(finding);
  }

  return {
    introduced,
    accepted: carried,
    resolved: [...accepted].filter((key) => !seen.has(key)).sort(),
  };
}

/** Builds a baseline from the current violations. */
export function makeBaseline(findings: readonly Finding[]): Baseline {
  return { version: 1, accepted: [...new Set(findings.map(violationKey))].sort() };
}

function daysOverdue(expiry: string, now: number): number {
  const due = Date.parse(`${expiry}T00:00:00Z`) / 1000;
  if (!Number.isFinite(due)) return 0;
  return Math.floor((now - due) / SECONDS_PER_DAY);
}
