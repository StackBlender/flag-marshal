import type {
  Confidence,
  Finding,
  FlagRecord,
  FlagReference,
} from '../api/generated/scan-report.js';
import { expectsLocalConfiguration, impliesTemporaryFeature } from '../detect/provider-traits.js';
import { evidenceValue } from '../evidence/collect.js';
import { DORMANT_DAYS, STALE_AGE_DAYS } from '../score/score.js';

export interface RuleInput {
  readonly flags: readonly FlagRecord[];
  readonly unresolvedReferences: readonly FlagReference[];
  /**
   * Extensions of flag-capable languages the scan saw but could not parse. Their
   * presence means "no code references this flag" might only mean "no code this
   * tool can read references it", so rules cap what they claim.
   */
  readonly unparsedLanguages?: readonly string[];
}

/**
 * Code that *reads* the flag. A declaration proves the flag exists but does not
 * use it, so counting declarations as usage made every declared Togglz flag look
 * referenced and hid the ones nothing actually calls.
 */
const isCode = (ref: FlagReference): boolean =>
  ref.kind === 'production-code' || ref.kind === 'test-code';
const isTest = (ref: FlagReference): boolean => ref.kind === 'test-code';

/**
 * Runs every rule over the inventory.
 *
 * Findings are returned in deterministic order — by flag key, then rule id — so
 * CI diffs, PR comments, and goldens stay stable across runs.
 */
export function applyRules(input: RuleInput): Finding[] {
  const findings: Finding[] = [
    ...unresolvedKeyFindings(input.unresolvedReferences),
    ...input.flags.flatMap((flag) => flagFindings(flag, input)),
  ];

  return findings.sort((a, b) => {
    const keyA = a.flagKey ?? '';
    const keyB = b.flagKey ?? '';
    if (keyA !== keyB) return keyA < keyB ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return compareRange(a, b);
  });
}

function compareRange(a: Finding, b: Finding): number {
  const ra = a.range;
  const rb = b.range;
  if (ra === undefined || rb === undefined) return 0;
  if (ra.file !== rb.file) return ra.file < rb.file ? -1 : 1;
  if (ra.start.line !== rb.start.line) return ra.start.line - rb.start.line;
  return ra.start.character - rb.start.character;
}

/**
 * A call site whose key could not be read.
 *
 * Reported at `high` confidence because there is nothing uncertain about it: the
 * tool is stating what it could not determine, which is always true.
 */
function unresolvedKeyFindings(unresolved: readonly FlagReference[]): Finding[] {
  return unresolved.map((ref) => ({
    id: 'flag.unresolved-key' as const,
    flagKey: null,
    severity: 'info' as const,
    confidence: 'high' as const,
    evidence: [{ kind: 'reference-count' as const, detail: 1 }],
    range: ref.range,
  }));
}

function flagFindings(flag: FlagRecord, input: RuleInput): Finding[] {
  const findings: Finding[] = [];
  const codeReferences = flag.references.filter(isCode);
  const anyUnresolved = input.unresolvedReferences.length > 0;

  // Configured, but nothing reads it.
  if (flag.inConfiguration && codeReferences.length === 0) {
    const unparsed = input.unparsedLanguages ?? [];
    findings.push({
      id: 'flag.absent-from-code',
      flagKey: flag.key,
      severity: 'warning',
      // Two things cap this claim. An unresolved reference elsewhere could be
      // exactly this flag, computed at runtime. And if the walk passed over
      // source in a language no grammar reads, the reference may simply be in a
      // file that was never opened — which is not the same as absent.
      confidence: anyUnresolved || unparsed.length > 0 ? 'low' : 'medium',
      evidence: [
        { kind: 'absent-from-code', detail: true },
        { kind: 'reference-count', detail: 0 },
        ...(anyUnresolved
          ? [{ kind: 'reference-count' as const, detail: input.unresolvedReferences.length }]
          : []),
        ...(unparsed.length > 0
          ? [{ kind: 'unreadable-languages' as const, detail: unparsed.join(', ') }]
          : []),
      ],
      ...rangeOf(flag),
    });
  }

  // Read by code, but no local configuration defines it — meaningful only for
  // mechanisms that are supposed to be configured locally. See provider-traits,
  // and keep this rule's explanation in catalog/messages.json consistent with
  // both gates below: the wording must not offer a cause they exclude.
  // A call site declaring `matchIfMissing = true` supplies its own behaviour when
  // no entry exists, so absence of configuration is normal rather than a defect.
  const requiresConfiguration = codeReferences.filter(
    (ref) => expectsLocalConfiguration(ref.provider) && ref.defaultsWhenAbsent !== true,
  );
  if (!flag.inConfiguration && requiresConfiguration.length > 0) {
    findings.push({
      id: 'flag.missing-in-configuration',
      flagKey: flag.key,
      severity: 'warning',
      confidence: 'medium',
      evidence: [
        { kind: 'absent-from-configuration', detail: true },
        { kind: 'reference-count', detail: requiresConfiguration.length },
      ],
      ...rangeOf(flag),
    });
  }

  // Old and untouched. Reported at the record's own confidence, never higher:
  // local evidence cannot see rollout state, so this is a lead, not a verdict.
  //
  // Age only means something for a flag someone intended to remove. A Spring
  // `@ConditionalOnProperty` guarding a queue listener or a scheduled job is a
  // permanent operational switch; reporting it as stale after a year is noise,
  // and it would force a team to allowlist nearly every job they run.
  const temporaryIntent = flag.references.some((ref) => impliesTemporaryFeature(ref.provider));
  const age = evidenceValue(flag.evidence, 'age-since-introduced');
  const dormant = evidenceValue(flag.evidence, 'time-since-last-modified');
  if (
    temporaryIntent &&
    age !== undefined &&
    age >= STALE_AGE_DAYS &&
    dormant !== undefined &&
    dormant >= DORMANT_DAYS
  ) {
    findings.push({
      id: 'flag.stale',
      flagKey: flag.key,
      severity: 'warning',
      confidence: flag.confidence,
      // The whole evidence trail travels with the finding, so nothing is
      // asserted without the user being able to see why.
      evidence: [...flag.evidence],
      ...rangeOf(flag),
    });
  }

  // Every code reference is a test. The production path has moved on.
  if (codeReferences.length > 0 && codeReferences.every(isTest)) {
    findings.push({
      id: 'flag.test-only',
      flagKey: flag.key,
      severity: 'info',
      confidence: confidenceForTestOnly(codeReferences.length, anyUnresolved),
      evidence: [
        { kind: 'test-only-references', detail: true },
        { kind: 'reference-count', detail: codeReferences.length },
      ],
      ...rangeOf(flag),
    });
  }

  return findings;
}

function confidenceForTestOnly(count: number, anyUnresolved: boolean): Confidence {
  if (anyUnresolved) return 'low';
  return count > 0 ? 'medium' : 'unknown';
}

/** Anchor a finding at the flag's first reference, when it has one. */
function rangeOf(flag: FlagRecord): { range?: FlagRecord['references'][number]['range'] } {
  const first = flag.references[0];
  return first === undefined ? {} : { range: first.range };
}
