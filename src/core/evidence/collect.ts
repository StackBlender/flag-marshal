import { parse } from 'yaml';
import type {
  Evidence,
  FlagRecord,
  ProviderReconciliation,
  ProviderState,
} from '../api/generated/scan-report.js';
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

/** What the caller knows about an Unleash export, besides its text. */
export interface UnleashExportInput {
  /** Where the export came from, already safe to print. */
  readonly source: string;
  /** The export's text, or undefined when it could not be read. */
  readonly text: string | undefined;
  readonly environment?: string;
  /** The user's declaration that the export holds every flag served to this code. */
  readonly complete: boolean;
}

interface ExportedFeature {
  readonly stale: boolean;
}

/**
 * Compares a local Unleash export with the flags found in code.
 *
 * This is provider-state evidence without a network call: the export is a file
 * the user produced. Nothing here says a flag can be deleted. Each entry is a
 * lead, and the snapshot's source, environment and completeness are reported
 * beside them so a reader knows how far to trust it.
 *
 * Nothing is guessed. No environment is assumed when none is named, and a flag
 * missing from the export is reported only when the user declared the export
 * complete.
 */
export function reconcileUnleash(
  input: UnleashExportInput,
  flags: readonly FlagRecord[],
): ProviderState {
  const empty = (status: ProviderState['status'], count = 0, exportedAt: string | null = null) =>
    ({
      provider: 'unleash',
      status,
      snapshot: {
        source: input.source,
        exportedAt,
        environment: input.environment ?? null,
        completeness: input.complete ? 'complete' : 'partial',
        featureCount: count,
      },
      reconciliation: [],
    }) satisfies ProviderState;

  if (input.text === undefined) return empty('unreadable');

  let parsed: unknown;
  try {
    // YAML is a superset of JSON, and Unleash can export either.
    parsed = parse(input.text);
  } catch {
    return empty('invalid');
  }
  const features = readFeatures(parsed);
  if (features === undefined) return empty('invalid');
  const root = parsed as Record<string, unknown>;
  const exportedAt = typeof root['exportedAt'] === 'string' ? root['exportedAt'] : null;

  const enabledIn = new Map<string, boolean>();
  let environmentSeen = false;
  const wanted = input.environment;
  if (wanted !== undefined) {
    const rows = [root['featureEnvironments'], root['featureStrategies']].flatMap((list) =>
      Array.isArray(list) ? (list as unknown[]) : [],
    );
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (r['environment'] !== wanted) continue;
      environmentSeen = true;
      if (typeof r['featureName'] === 'string' && typeof r['enabled'] === 'boolean') {
        enabledIn.set(r['featureName'], r['enabled']);
      }
    }
    const declared = Array.isArray(root['environments'])
      ? (root['environments'] as unknown[]).some(
          (e) => e !== null && typeof e === 'object' && (e as { name?: unknown }).name === wanted,
        )
      : false;
    if (!environmentSeen && !declared)
      return empty('environment-not-in-export', features.size, exportedAt);
  }

  const inCode = new Set<string>();
  const unleashInCode = new Set<string>();
  for (const flag of flags) {
    const code = flag.references.filter(
      (ref) => ref.kind === 'production-code' || ref.kind === 'test-code',
    );
    if (code.length === 0) continue;
    inCode.add(flag.key);
    if (code.some((ref) => ref.provider === 'unleash')) unleashInCode.add(flag.key);
  }

  const out: ProviderReconciliation[] = [];
  for (const [key, feature] of features) {
    if (!inCode.has(key)) out.push({ flagKey: key, kind: 'in-export-not-in-code' });
    if (feature.stale) out.push({ flagKey: key, kind: 'marked-stale-by-provider' });
    if (enabledIn.get(key) === false) out.push({ flagKey: key, kind: 'disabled-in-environment' });
  }
  if (input.complete) {
    for (const key of unleashInCode) {
      if (!features.has(key)) out.push({ flagKey: key, kind: 'in-code-not-in-export' });
    }
  }
  out.sort((a, b) =>
    a.flagKey === b.flagKey ? (a.kind < b.kind ? -1 : 1) : a.flagKey < b.flagKey ? -1 : 1,
  );

  return { ...empty('loaded', features.size, exportedAt), reconciliation: out };
}

/** Features of a recognizable Unleash export, or undefined when it is not one. */
function readFeatures(parsed: unknown): Map<string, ExportedFeature> | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const list = (parsed as { features?: unknown }).features;
  if (!Array.isArray(list)) return undefined;

  const features = new Map<string, ExportedFeature>();
  for (const entry of list as unknown[]) {
    if (entry === null || typeof entry !== 'object') continue;
    const f = entry as Record<string, unknown>;
    if (typeof f['name'] !== 'string' || f['name'] === '') continue;
    features.set(f['name'], { stale: f['stale'] === true || f['archived'] === true });
  }
  return features;
}
