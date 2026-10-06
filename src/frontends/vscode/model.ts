/**
 * The VS Code view model.
 *
 * Everything the extension shows is computed here, as plain data, from a
 * `ScanReport`. Nothing in this file imports `vscode`: the extension host module
 * is a thin translation of these records into `vscode.Diagnostic` and tree items,
 * and that split is what makes the interesting behaviour testable in the ordinary
 * suite instead of only inside a running editor.
 *
 * It authors no wording. Every string comes from `src/present`, which reads the
 * message catalog — see `test/architecture/boundaries.test.ts`.
 */

import type {
  Finding,
  FlagRecord,
  ScanReport,
  Severity,
  SourceRange,
} from '../../core/api/index.js';
import { count, evidenceSummary, explanationOf, fillTitle } from '../../present/index.js';
import { debtReasons, helperCandidates } from '../../present/summary.js';

/**
 * VS Code's four severities. `Severity` in the contract has three, because SARIF
 * and CI have three; `hint` exists here only so a future rule can be shown
 * without being nagging, and nothing maps to it yet.
 */
export type EditorSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface EditorDiagnostic {
  /** Workspace-relative, forward slashes, exactly as the contract stores it. */
  readonly file: string;
  readonly range: SourceRange;
  /** The finding id, shown by VS Code and used to filter. */
  readonly code: Finding['id'];
  /** The conclusion. One line, because it is what a squiggle and a list show. */
  readonly message: string;
  /**
   * The catalog explanation, the evidence, and the confidence.
   *
   * A frontend must display this. Every finding in this product carries the
   * evidence that produced it, because a claim asserted bare is one the user has
   * no way to weigh — and the first time it is wrong, the tool gets uninstalled.
   * A host with nowhere separate to put it appends it to the message rather than
   * dropping it.
   */
  readonly detail: string;
  readonly severity: EditorSeverity;
  readonly source: 'Flag Marshal';
}

export interface DiagnosticSet {
  /** Diagnostics grouped by file, ready to hand to one collection per URI. */
  readonly byFile: ReadonlyMap<string, readonly EditorDiagnostic[]>;
  /**
   * Findings that concern the workspace rather than a location — a debt budget
   * breach names no flag and no file. These have nowhere to be underlined, so the
   * extension shows them in its view. Dropping them silently would hide the one
   * finding a team actually agreed to enforce.
   */
  readonly workspace: readonly EditorDiagnostic[];
}

const SEVERITY: Record<Severity, EditorSeverity> = {
  error: 'error',
  warning: 'warning',
  info: 'information',
};

/**
 * Findings that are worth reporting but not worth underlining every reference of.
 *
 * `flag.unresolved-key` is already rendered at its own call site; the rest of a
 * flag's references have nothing to do with it.
 */
const NOT_INLINE = new Set<Finding['id']>(['flag.unresolved-key']);

/**
 * Turns a report into editor diagnostics.
 *
 * A finding carrying its own range lands there. A finding about a flag — expired,
 * stale, missing an owner — carries no range, because the debt is the flag, not
 * one line of it. Those are attached to **every** reference of that flag, which is
 * the only way a developer opening one file learns that the flag they are reading
 * is overdue. Attaching them to the first reference instead would mean the warning
 * is invisible in every file but one, which is the same as not reporting it.
 */
export function toDiagnostics(report: ScanReport): DiagnosticSet {
  const byFile = new Map<string, EditorDiagnostic[]>();
  const workspace: EditorDiagnostic[] = [];
  const flags = new Map(report.flags.map((flag) => [flag.key, flag]));

  const add = (diagnostic: EditorDiagnostic): void => {
    const existing = byFile.get(diagnostic.file);
    if (existing === undefined) byFile.set(diagnostic.file, [diagnostic]);
    else existing.push(diagnostic);
  };

  for (const finding of report.findings) {
    if (finding.range !== undefined) {
      add(diagnosticAt(finding, finding.range));
      continue;
    }

    const flag =
      finding.flagKey === undefined || finding.flagKey === null
        ? undefined
        : flags.get(finding.flagKey);

    if (flag === undefined || flag.references.length === 0 || NOT_INLINE.has(finding.id)) {
      workspace.push(diagnosticAt(finding, undefined));
      continue;
    }

    for (const reference of flag.references) add(diagnosticAt(finding, reference.range));
  }

  return { byFile, workspace };
}

function diagnosticAt(finding: Finding, range: SourceRange | undefined): EditorDiagnostic {
  const evidence = evidenceSummary(finding);
  const confidence = `Confidence: ${finding.confidence}.`;
  return {
    file: range?.file ?? '',
    range: range ?? NO_RANGE,
    code: finding.id,
    message: fillTitle(finding),
    // Evidence is in the hover, not the message: the message is what appears in a
    // squiggle and a one-line list, and a claim without its evidence is exactly
    // what gets an analyzer distrusted the first time it is wrong.
    detail: [explanationOf(finding), evidence === '' ? undefined : `Why: ${evidence}`, confidence]
      .filter((part) => part !== undefined)
      .join('\n'),
    severity: SEVERITY[finding.severity],
    source: 'Flag Marshal',
  };
}

const NO_RANGE: SourceRange = {
  file: '',
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

/**
 * How long a scan may take before rescanning on every save stops being a service.
 *
 * Measured against a 12-repository corpus: most repositories scan in well under a
 * second, but Spring Boot's takes about 55 seconds — parsing, not git evidence,
 * which accounts for only a quarter of it. Re-running that after every save would
 * keep a core pegged for the rest of the afternoon.
 */
export const AUTO_RESCAN_BUDGET_MS = 3_000;

/**
 * Whether saving a file should trigger a rescan, given how long the last one took.
 *
 * The first scan always happens. After that the extension earns the right to run
 * automatically by being fast; a workspace where it is not stays on the manual
 * command. Silently continuing would be worse than either: the user would see an
 * editor that stutters and never learn why.
 */
export function shouldAutoRescan(lastScanMs: number | undefined): boolean {
  return lastScanMs === undefined || lastScanMs <= AUTO_RESCAN_BUDGET_MS;
}

export interface InventoryReference {
  readonly range: SourceRange;
  readonly kind: FlagRecord['references'][number]['kind'];
  /** `path/to/file.ts:42` — one-based, because that is what the gutter shows. */
  readonly label: string;
}

export interface InventoryFlag {
  readonly key: string;
  readonly label: string;
  /** `3 references · production` — the summary line under the key. */
  readonly description: string;
  readonly inConfiguration: boolean;
  readonly testOnly: boolean;
  readonly references: readonly InventoryReference[];
  /** Ids of findings concerning this flag, so the view can badge it. */
  readonly findings: readonly Finding['id'][];
  /** 0-100. What the flag probably costs — never whether it is safe to remove. */
  readonly debtScore: number;
  /** The evidence behind its rank; empty when it carries no debt signal. */
  readonly reasons: readonly string[];
  /** Hover text: the reasons, so a rank is never shown without its evidence. */
  readonly tooltip: string;
}

/** How the inventory is ordered. Debt first is the default; name is stable. */
export type FlagOrder = 'debt' | 'name';

/**
 * Orders flags for the tree. In debt order, flags with a debt reason come first,
 * highest score first, then everything else by key — the same ranking the CLI
 * prints, so an editor and a terminal never disagree about what to look at.
 */
export function arrangeFlags(flags: readonly InventoryFlag[], order: FlagOrder): InventoryFlag[] {
  const byKey = [...flags].sort((a, b) => a.key.localeCompare(b.key));
  if (order === 'name') return byKey;
  const ranked = byKey
    .filter((flag) => flag.reasons.length > 0)
    .sort((a, b) => b.debtScore - a.debtScore || a.key.localeCompare(b.key));
  return [...ranked, ...byKey.filter((flag) => flag.reasons.length === 0)];
}

export interface Inventory {
  readonly flags: readonly InventoryFlag[];
  /**
   * Provider platforms found in the workspace that this version cannot read. The
   * view states them, because an inventory that silently omits a whole platform
   * is a confident wrong answer.
   */
  readonly unsupported: readonly { readonly name: string; readonly description: string }[];
  /** Calls to a real SDK whose key is computed. Reported, never guessed. */
  readonly unresolved: readonly InventoryReference[];
  /** The tree's line under the computed-key count: what to do about them. */
  readonly unresolvedDescription: string;
}

/**
 * The flag inventory, sorted by key. The view arranges it with `arrangeFlags`,
 * so switching order never needs a rescan.
 */
export function toInventory(report: ScanReport): Inventory {
  const findingsByFlag = new Map<string, Finding['id'][]>();
  for (const finding of report.findings) {
    const key = finding.flagKey;
    if (key === undefined || key === null) continue;
    const ids = findingsByFlag.get(key);
    if (ids === undefined) findingsByFlag.set(key, [finding.id]);
    else ids.push(finding.id);
  }

  const flags = [...report.flags]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((flag) => {
      const testOnly = flag.references.every((r) => r.kind === 'test-code');
      const reasons = debtReasons(flag);
      const debtScore = flag.debtScore ?? 0;
      const parts = [count(flag.references.length, 'reference')];
      if (reasons.length > 0) parts.unshift(`debt ${debtScore}`);
      if (testOnly) parts.push('test code only');
      if (!flag.inConfiguration) parts.push('not in configuration');
      return {
        key: flag.key,
        label: flag.key,
        description: parts.join(' · '),
        inConfiguration: flag.inConfiguration,
        testOnly,
        references: flag.references.map(toInventoryReference),
        findings: findingsByFlag.get(flag.key) ?? [],
        debtScore,
        reasons,
        tooltip:
          reasons.length === 0
            ? flag.key
            : `${flag.key} — debt score ${debtScore}\n${reasons.join('\n')}`,
      };
    });

  const unsupported = (report.unsupportedProviders ?? []).map((provider) => ({
    name: provider.name,
    description:
      provider.files.length === 1
        ? `not supported yet · ${provider.files[0] ?? ''}`
        : `not supported yet · ${count(provider.files.length, 'file')}`,
  }));

  return {
    flags,
    unsupported,
    unresolved: report.unresolvedReferences.map(toInventoryReference),
    unresolvedDescription: unresolvedDescription(helperCandidates(report)),
  };
}

/** Names the helper when the scan found one, so the fix is visible in the tree. */
function unresolvedDescription(helpers: readonly string[]): string {
  if (helpers.length === 0) return 'read from a variable, not reported as a flag';
  return `passed through ${helpers.join(', ')}: declare in customPatterns.methods`;
}

function toInventoryReference(reference: FlagRecord['references'][number]): InventoryReference {
  return {
    range: reference.range,
    kind: reference.kind,
    // Line numbers are one-based here and zero-based in the contract. The
    // conversion happens at the frontend edge, exactly as it does in the CLI.
    label: `${reference.range.file}:${reference.range.start.line + 1}`,
  };
}
