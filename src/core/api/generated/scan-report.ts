/**
 * DO NOT EDIT BY HAND.
 *
 * Generated from schema/v1/scan-report.schema.json by scripts/generate-types.mjs.
 * Change the schema, then run `npm run generate:types`.
 */

/**
 * How the `character` field of a Position is counted. Declared once per report so each frontend converts at its own edge: IntelliJ uses character offsets, LSP uses UTF-16 code units, tree-sitter emits bytes. Never leave this implicit.
 */
export type PositionEncoding = 'utf-8' | 'utf-16' | 'utf-32';
/**
 * The flag mechanism a reference was detected through.
 */
export type Provider =
  | 'launchdarkly'
  | 'openfeature'
  | 'unleash'
  | 'togglz'
  | 'spring-conditional'
  | 'properties'
  | 'environment'
  | 'custom';
export type Language =
  'typescript' | 'javascript' | 'java' | 'kotlin' | 'yaml' | 'properties' | 'shell';
/**
 * Where a reference lives. `declaration` is where a flag is defined — a Togglz enum constant — which establishes that the flag exists but is not code that reads it. Test-only usage is tracked separately because a flag referenced solely from tests is a distinct kind of debt.
 */
export type ReferenceKind = 'declaration' | 'production-code' | 'test-code' | 'configuration';
/**
 * Whether the flag key could be read from the source. Computed and non-literal keys are reported as `unresolved` and never guessed.
 */
export type Resolution = 'resolved' | 'unresolved';
/**
 * Local evidence only. Runtime and provider evidence (rollout percentage, archived-upstream state, recent evaluations) is not available locally and is deliberately absent from v1. `unreadable-languages` records that the scan passed over source it has no grammar for, which is a limit on what any other signal can be taken to mean.
 */
export type EvidenceKind =
  | 'reference-count'
  | 'age-since-introduced'
  | 'time-since-last-modified'
  | 'absent-from-configuration'
  | 'absent-from-code'
  | 'test-only-references'
  | 'unreadable-languages'
  | 'module-spread'
  | 'branch-complexity'
  | 'declared-owner'
  | 'declared-expiry'
  | 'flag-count'
  | 'budget';
/**
 * How much the local evidence supports the claim. Nothing may be described as safe to delete below `high`, and never without its evidence.
 */
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
/**
 * Stable rule identifiers. Each must have a matching entry in catalog/messages.json; a test enforces that both directions stay in sync.
 */
export type FindingId =
  | 'flag.unresolved-key'
  | 'flag.missing-in-configuration'
  | 'flag.absent-from-code'
  | 'flag.test-only'
  | 'flag.stale'
  | 'flag.missing-owner'
  | 'flag.missing-expiry'
  | 'flag.expired'
  | 'flag.budget-exceeded';
export type Severity = 'error' | 'warning' | 'info';
export type ProviderReconciliationKind =
  | 'in-export-not-in-code'
  | 'in-code-not-in-export'
  | 'marked-stale-by-provider'
  | 'disabled-in-environment';

/**
 * The wire contract between the Flag Marshal core and every frontend. This file is the source of truth: TypeScript and Kotlin models are generated from it, never hand-written. Frontends are renderers of this payload. PRE-RELEASE CONTRACT POLICY: Flag Marshal is unpublished, so version 1.0 is still mutable — enum members may be added and shapes refined without a version bump, because no external consumer exists to break. Two rules already apply and survive first release: a field added within a version is optional, never required; and once published, any breaking change bumps the major version. Delete this paragraph at first release.
 */
export interface ScanReport {
  /**
   * Contract version. Consumers must reject a major version they do not understand.
   */
  schemaVersion: '1.0';
  tool: ToolInfo;
  /**
   * Absolute path of the workspace root that was analyzed.
   */
  root: string;
  positionEncoding: PositionEncoding;
  /**
   * Every flag discovered, in deterministic order by key.
   */
  flags: FlagRecord[];
  /**
   * References whose flag key could not be read statically. They belong to no flag record, so they are reported here rather than dropped. Computed keys are never guessed — this array is the product's central credibility guarantee made visible.
   */
  unresolvedReferences: FlagReference[];
  /**
   * Flag providers detected in the workspace that this build cannot analyze. Reporting a small inventory while silently ignoring an entire flag platform is as misleading as a false positive, so the gap is stated rather than hidden. Optional: added within contract 1.0, so a report written by an older build without it is still valid.
   */
  unsupportedProviders?: {
    name: string;
    /**
     * What gave it away, such as an imported module.
     */
    evidence: string;
    files: string[];
  }[];
  /**
   * Rule results, in deterministic order.
   */
  findings: Finding[];
  changes?: ChangeSet;
  providerState?: ProviderState;
}
export interface ToolInfo {
  name: 'flag-marshal';
  coreVersion: string;
}
export interface FlagRecord {
  key: string;
  references: FlagReference[];
  /**
   * Whether the key appears in any parsed configuration source.
   */
  inConfiguration: boolean;
  evidence: Evidence[];
  /**
   * Relative debt weight. Absent until Milestone 5 computes it.
   */
  debtScore?: number;
  confidence: Confidence;
}
export interface FlagReference {
  /**
   * The flag key, or null when resolution is `unresolved`.
   */
  key: string | null;
  range: SourceRange;
  provider: Provider;
  language: Language;
  kind: ReferenceKind;
  resolution: Resolution;
  /**
   * For unresolved references, the source text that could not be resolved. Present only to help a human understand why; never parsed downstream.
   */
  expression?: string;
  /**
   * True when the call site supplies its own behaviour if no configuration entry exists — Spring's `matchIfMissing = true`. Absence of configuration is then normal, not a defect.
   */
  defaultsWhenAbsent?: boolean;
  /**
   * For unresolved references only: the name of the enclosing function when the key is one of its own parameters, passed through unchanged. That shape is usually a team's own flag helper, and declaring it under `customPatterns.methods` makes each of its callers readable. A suggestion to the user, never used to attribute anything.
   */
  helperCandidate?: string;
}
export interface SourceRange {
  /**
   * Path relative to the workspace root, using forward slashes on every platform.
   */
  file: string;
  start: Position;
  end: Position;
}
export interface Position {
  /**
   * Zero-based line number.
   */
  line: number;
  /**
   * Zero-based offset within the line, counted per the report's positionEncoding.
   */
  character: number;
}
/**
 * One observation supporting a confidence level. Every finding carries the evidence that produced it, so a user can always see why a claim was made.
 */
export interface Evidence {
  kind: EvidenceKind;
  /**
   * Machine-readable value for this observation. Rendered into text by the frontend via the message catalog, never by the core.
   */
  detail: string | number | boolean | null;
}
export interface Finding {
  id: FindingId;
  /**
   * The flag this finding concerns, or null for a finding about an unresolvable reference.
   */
  flagKey?: string | null;
  severity: Severity;
  confidence: Confidence;
  evidence: Evidence[];
  range?: SourceRange;
}
/**
 * Present only when the report was asked to compare against an earlier commit (`--changed-since`). What this change does to the flag inventory, relative to the merge base of the requested ref and HEAD. Every other field still describes the whole workspace as it is now. Optional: added within contract 1.0.
 */
export interface ChangeSet {
  since: {
    /**
     * The ref as the user gave it.
     */
    ref: string;
    /**
     * The commit compared against: the merge base of `ref` and HEAD.
     */
    commit: string;
  };
  /**
   * Keys of flags that exist now and did not at the base, sorted.
   */
  addedFlags: string[];
  /**
   * Keys of flags that existed at the base and no longer exist, sorted.
   */
  removedFlags: string[];
  /**
   * Flags present in both whose number of references changed, sorted by key.
   */
  changedFlags: {
    key: string;
    referencesBefore: number;
    referencesAfter: number;
  }[];
  /**
   * Findings present now and not at the base, with their current positions.
   */
  introducedFindings: Finding[];
  /**
   * Findings present at the base and not now. Positions refer to the base commit.
   */
  resolvedFindings: Finding[];
  /**
   * Unresolved references present now and not at the base.
   */
  introducedUnresolved: FlagReference[];
  /**
   * Unresolved references present at the base and not now. Positions refer to the base commit.
   */
  resolvedUnresolved: FlagReference[];
}
/**
 * Present only when a provider export was supplied (`--unleash-export` or `providerState.unleash` in settings). What a local snapshot of the provider's state says about the flags found in code, read entirely offline. The snapshot's provenance, environment and completeness travel with it, and its entries are leads: none is a deletion verdict, none raises a policy violation, and a flag absent from a partial snapshot is never reported as missing. Optional: added within contract 1.0.
 */
export interface ProviderState {
  /**
   * Which provider's export this is. Unleash is the only adapter so far.
   */
  provider: 'unleash';
  /**
   * `loaded`: the export was read and reconciled. `unreadable`: the file could not be read. `invalid`: it was read but is not a recognizable Unleash export. `environment-not-in-export`: the requested environment does not occur in the export, so nothing environment-specific was reconciled. Anything but `loaded` carries no reconciliation entries that depend on what failed.
   */
  status: 'loaded' | 'unreadable' | 'invalid' | 'environment-not-in-export';
  snapshot: ProviderSnapshot;
  /**
   * Differences between the snapshot and the code, ordered by flag key then kind.
   */
  reconciliation: ProviderReconciliation[];
}
/**
 * Where a provider snapshot came from and how far it can be trusted.
 */
export interface ProviderSnapshot {
  /**
   * The export file, relative to the workspace root when it lies inside it, otherwise only its file name.
   */
  source: string;
  /**
   * The export's own timestamp, or null when the file carries none. Never inferred from file times.
   */
  exportedAt: string | null;
  /**
   * The environment the reconciliation was done for, or null when none was chosen. Never guessed.
   */
  environment: string | null;
  /**
   * `complete` only when the user declared that the export holds every flag the provider serves to this code. Otherwise `partial`, and a flag missing from the snapshot proves nothing.
   */
  completeness: 'complete' | 'partial';
  /**
   * Features in the export.
   */
  featureCount: number;
}
/**
 * One difference between a provider snapshot and the code. A lead for a person to check, never a verdict that a flag is safe to delete.
 */
export interface ProviderReconciliation {
  flagKey: string;
  kind: ProviderReconciliationKind;
}
