/**
 * The single public surface of the Flag Marshal core.
 *
 * Every frontend — CLI, RPC server, VS Code, and later IntelliJ — reaches the
 * analysis engine through this module and nothing deeper. Reaching into
 * `core/detect`, `core/score`, or any other internal module is what makes
 * frontends drift apart, so it is blocked by lint and by
 * `test/architecture/boundaries.test.ts`.
 *
 * See `docs/design.md`, "Reuse across frontends".
 */

/**
 * The wire contract. These types are generated from
 * `schema/v1/scan-report.schema.json` and must never be hand-edited — the schema
 * is the source of truth for the TypeScript models here and for the Kotlin models
 * the IntelliJ frontend will generate from the same file.
 */
export type {
  Confidence,
  Evidence,
  EvidenceKind,
  ChangeSet,
  Finding,
  FindingId,
  FlagRecord,
  FlagReference,
  Language,
  Position,
  PositionEncoding,
  Provider,
  ReferenceKind,
  Resolution,
  ScanReport,
  Severity,
  SourceRange,
  ToolInfo,
} from './generated/scan-report.js';

export {
  CATALOG_VERSION,
  messageCatalog,
  type MessageCatalog,
  type MessageEntry,
} from './catalog.js';

/**
 * Analysis capabilities available so far.
 *
 * `scanSource` reads one file's text; it never touches the filesystem itself, so
 * the caller decides what a workspace is. Walking a directory and assembling a
 * full `ScanReport` arrives with the CLI in Milestone 3.
 */
export { scanSource, scanSources, type SourceFile } from '../detect/scan-source.js';
export { buildIndex, type FlagIndex } from '../refindex/build-index.js';
export { GRAMMARS, grammarFor, type GrammarSpec } from '../detect/languages.js';
export { applyRules, type RuleInput } from '../rules/apply-rules.js';
export {
  configKindFor,
  parseConfig,
  type ConfigEntry,
  type ConfigKind,
} from '../config/parse-config.js';
export {
  readSettings,
  SETTINGS_FILE,
  DEFAULT_SETTINGS,
  DEFAULT_POLICY,
  isIsoDate,
  type Settings,
  type Policy,
  type FlagMetadata,
} from '../config/settings.js';
export { readInlineMetadata } from '../detect/metadata.js';
export {
  evaluatePolicy,
  applyRatchet,
  makeBaseline,
  violationKey,
  type Baseline,
  type PolicyInput,
  type RatchetResult,
} from '../policy/evaluate.js';
export { readTrend, type Trend, type TrendPoint } from '../policy/trend.js';
export { compareReports, type ComparisonBase } from '../compare/compare.js';
export { BASELINE_PATH, type Baselines } from './baselines.js';

/** Finding ids that `check` enforces. Drift findings are reported, not enforced. */
export const POLICY_FINDING_IDS = [
  'flag.missing-owner',
  'flag.missing-expiry',
  'flag.expired',
  'flag.budget-exceeded',
] as const;
export { BUILT_IN_ADAPTERS, customAdapter } from '../detect/providers/index.js';
export { methodCallQuery, springConditionalQuery } from '../detect/queries.js';
export { expectsLocalConfiguration } from '../detect/provider-traits.js';

/**
 * Positions in a report are counted in UTF-16 code units, matching LSP. Every
 * report declares this explicitly so each frontend converts at its own edge
 * rather than guessing: IntelliJ uses character offsets and tree-sitter emits
 * bytes. Leaving it implicit produces off-by-one highlights that are miserable to
 * debug across three UIs.
 */
export const POSITION_ENCODING = 'utf-16';

export type { FileSystem, DirectoryEntry } from './filesystem.js';
export { noGitHistory, type GitHistory, type KeyHistory, type FileRevision } from './git.js';
export {
  collectEvidence,
  evidenceValue,
  evidenceFlag,
  type EvidenceContext,
} from '../evidence/collect.js';
export {
  scoreFlag,
  STALE_AGE_DAYS,
  DORMANT_DAYS,
  type Score,
  type ScoreInput,
} from '../score/score.js';
export {
  openWorkspace,
  CORE_VERSION,
  SCHEMA_VERSION,
  type AnalysisSession,
  type OpenWorkspaceOptions,
} from '../workspace/session.js';
