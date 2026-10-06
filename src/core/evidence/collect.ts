import type { Evidence, FlagRecord } from '../api/generated/scan-report.js';
import type { GitHistory } from '../api/git.js';
import { expectsLocalConfiguration } from '../detect/provider-traits.js';

const SECONDS_PER_DAY = 86_400;

export interface EvidenceContext {
  readonly git: GitHistory;
  /** Unix seconds treated as "now", so scans are reproducible in tests. */
  readonly now: number;
}

/**
 * Collects local evidence for one flag.
 *
 * Only local evidence exists here, by design. Rollout percentage, upstream
 * archive state, and recent evaluation activity live in a provider's backend and
 * cannot be known from a checkout — so the tool never implies it knows them.
 */
export async function collectEvidence(
  flag: FlagRecord,
  context: EvidenceContext,
): Promise<Evidence[]> {
  const evidence: Evidence[] = [];
  // Declarations are inventory, not usage; see apply-rules.ts.
  const code = flag.references.filter(
    (ref) => ref.kind === 'production-code' || ref.kind === 'test-code',
  );

  evidence.push({ kind: 'reference-count', detail: code.length });

  const spread = moduleSpread(flag);
  if (spread > 0) evidence.push({ kind: 'module-spread', detail: spread });

  if (code.length > 0 && code.every((ref) => ref.kind === 'test-code')) {
    evidence.push({ kind: 'test-only-references', detail: true });
  }

  // Absence from configuration is only evidence for mechanisms that are meant to
  // be configured locally. A LaunchDarkly flag is served from LaunchDarkly, so
  // its absence from application.properties says nothing at all — recording it
  // as evidence would manufacture a staleness signal out of normal operation.
  const locallyConfigured = code.some((ref) => expectsLocalConfiguration(ref.provider));
  if (!flag.inConfiguration && locallyConfigured) {
    evidence.push({ kind: 'absent-from-configuration', detail: true });
  }
  if (code.length === 0) {
    evidence.push({ kind: 'absent-from-code', detail: true });
  }

  const history = await context.git.historyOf(flag.key);
  if (history !== undefined) {
    evidence.push({
      kind: 'age-since-introduced',
      detail: days(context.now - history.firstSeen),
    });
    evidence.push({
      kind: 'time-since-last-modified',
      detail: days(context.now - history.lastChanged),
    });
  }

  return evidence;
}

/**
 * Conventional build-layout prefixes that say nothing about where code lives.
 *
 * Under Maven and Gradle every source file starts `src/main/java`, so a
 * first-segment rule reports module spread 1 for a flag touching controllers,
 * services, workers and tests alike — which makes the evidence and the debt score
 * meaningless on exactly the repositories that need them.
 */
const LAYOUT_PREFIX =
  /^(?:src\/(?:main|test)\/(?:java|kotlin|scala|resources|groovy)\/|src\/|app\/|lib\/)/;

/**
 * The module a file belongs to: its directory, once build scaffolding is removed.
 *
 * A package is the smallest boundary that means something to a person reading the
 * report — `com/example/billing` versus `com/example/search` really are different
 * parts of the system, while `src` versus `src` is not a distinction at all.
 */
export function moduleOf(file: string): string {
  const stripped = file.replace(LAYOUT_PREFIX, '');
  const directory = stripped.split('/').slice(0, -1).join('/');
  return directory === '' ? '.' : directory;
}

/**
 * Distinct modules a flag reaches into.
 *
 * A flag touching one module is a local concern; one touching five is a
 * cross-cutting condition that is genuinely harder to remove, and the difference
 * belongs in the score.
 */
function moduleSpread(flag: FlagRecord): number {
  const modules = new Set<string>();
  for (const ref of flag.references) modules.add(moduleOf(ref.range.file));
  return modules.size;
}

function days(seconds: number): number {
  return Math.max(0, Math.floor(seconds / SECONDS_PER_DAY));
}

/** Reads a numeric evidence value by kind, when present. */
export function evidenceValue(
  evidence: readonly Evidence[],
  kind: Evidence['kind'],
): number | undefined {
  const found = evidence.find((item) => item.kind === kind);
  return typeof found?.detail === 'number' ? found.detail : undefined;
}

/** True when a boolean evidence item is present and true. */
export function evidenceFlag(evidence: readonly Evidence[], kind: Evidence['kind']): boolean {
  return evidence.some((item) => item.kind === kind && item.detail === true);
}
