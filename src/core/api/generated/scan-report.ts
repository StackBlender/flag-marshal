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
