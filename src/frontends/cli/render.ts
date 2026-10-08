import {
  type ChangeSet,
  type RatchetResult,
  type Confidence,
  type Finding,
  type ScanReport,
} from '../../core/api/index.js';
import { count, evidenceSummary, fillTitle } from '../../present/index.js';
import {
  debtReasons,
  headlineParts,
  helperCandidates,
  rankByDebt,
  summarize,
} from '../../present/summary.js';

/** Enough to act on without scrolling; the full inventory follows. */
const RANKING_LIMIT = 10;

/**
 * Renders a scan report for a terminal.
 *
 * Line numbers are printed 1-based because that is what editors and humans use,
 * while the contract stores them 0-based. The conversion happens here, at the
 * frontend's edge, exactly like position encoding.
 */
export function renderScan(report: ScanReport): string {
  const lines: string[] = [];
  // Optional in the contract, so an older report simply has none.
  const unsupported = report.unsupportedProviders ?? [];
  const flagCount = report.flags.length;
  const referenceCount = report.flags.reduce((n, flag) => n + flag.references.length, 0);
  const unresolved = report.unresolvedReferences.length;

  // Findings must survive this: a policy violation with no flag attached — a
  // budget breach, for instance — would otherwise be swallowed by the empty
  // case and the user would be told nothing was found.
  if (
    flagCount === 0 &&
    unresolved === 0 &&
    report.findings.length === 0 &&
    unsupported.length === 0
  ) {
    return 'No feature flags found.';
  }

  if (flagCount > 0) {
    lines.push(`${count(flagCount, 'feature flag')}, ${count(referenceCount, 'reference')}`);
    const headline = headlineParts(summarize(report));
    if (headline.length > 0) lines.push(headline.join(' · '));
    lines.push('');
    lines.push(...ranking(report));
  }

  for (const flag of report.flags) {
    const testOnly = flag.references.every((r) => r.kind === 'test-code');
    const note = testOnly ? '  (test code only)' : '';
    lines.push(`  ${flag.key}${note}`);
    for (const ref of flag.references) {
      lines.push(`      ${location(ref.range.file, ref.range.start.line)}`);
    }
    lines.push('');
  }

  if (unresolved > 0) {
    lines.push(`${count(unresolved, 'reference')} could not be resolved:`);
    for (const ref of report.unresolvedReferences) {
      const where = location(ref.range.file, ref.range.start.line);
      const inside =
        ref.helperCandidate === undefined ? '' : `  (passed through ${ref.helperCandidate})`;
      lines.push(`      ${where}  [${ref.provider}]  ${ref.expression ?? ''}${inside}`.trimEnd());
    }
    lines.push('');
    // Every reference here is a confirmed provider call — the provider is named
    // above so the claim can be checked. Ordinary methods that merely share a
    // name with an SDK are not reported at all; see provider-identity.ts.
    lines.push('  These are calls to a flag SDK whose key is computed rather than');
    lines.push('  literal, so it cannot be read from the source. Reported, never guessed.');
    // The commonest unresolved call is the one inside a team's own helper, and
    // it lowers confidence across the whole repository until it is declared.
    lines.push(...helperHint(helperCandidates(report)));
    lines.push('');
  }

  // Stated before the findings, because it changes how the numbers above should
  // be read. An inventory that silently omits an entire flag platform is a
  // confident wrong answer, which is the one thing this tool must never give.
  if (unsupported.length > 0) {
    for (const provider of unsupported) {
      const where =
        provider.files.length === 1 ? provider.files[0] : `${provider.files.length} files`;
      lines.push(`  ! ${provider.name} is in use but is not supported yet (${where}).`);
    }
    lines.push('    Flags managed by it are missing from the inventory above.');
    lines.push('');
  }

  const reportable = report.findings.filter((f) => f.id !== 'flag.unresolved-key');
  if (reportable.length > 0) {
    lines.push(`${count(reportable.length, 'finding')}:`);
    lines.push('');
    for (const finding of reportable) {
      lines.push(`  ${fillTitle(finding)}  [${confidenceLabel(finding.confidence)}]`);
      if (finding.range !== undefined) {
        lines.push(`      ${location(finding.range.file, finding.range.start.line)}`);
      }
      lines.push(`      why: ${evidenceSummary(finding)}`);
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

/**
 * Names the helpers when the scan found them, so the fix is a paste rather than
 * a search. Falls back to the general advice when no key is a plain pass-through.
 */
function helperHint(candidates: readonly string[]): string[] {
  if (candidates.length === 0) {
    return [
      '  If one sits inside your own flag helper, list that helper under',
      '  customPatterns.methods in .flagmarshal.yml: its callers are then read',
      '  one by one, and the helper no longer lowers confidence.',
    ];
  }
  const them = candidates.length === 1 ? 'it' : 'them';
  return [
    `  ${candidates.join(', ')} ${candidates.length === 1 ? 'passes' : 'pass'} a key straight to the SDK. If ${them} ${candidates.length === 1 ? 'is your flag helper' : 'are your flag helpers'},`,
    `  declare ${them} in .flagmarshal.yml. Each call is then read on its own, and`,
    '  these lines stop lowering confidence:',
    '',
    '      customPatterns:',
    `        methods: [${candidates.join(', ')}]`,
  ];
}

/**
 * The flags most worth a look, before the alphabetical inventory. Each row names
 * the evidence behind its rank, because a bare score invites being read as a
 * verdict. Confidence stays on the findings, where it qualifies a specific claim.
 */
function ranking(report: ScanReport): string[] {
  const ranked = rankByDebt(report, RANKING_LIMIT);
  if (ranked.length === 0) return [];
  const lines = ['Worth reviewing first (debt score 0-100, highest first):'];
  for (const flag of ranked) {
    const score = String(flag.debtScore ?? 0).padStart(5);
    lines.push(`${score}  ${flag.key}`);
    lines.push(`         ${debtReasons(flag).join('; ')}`);
  }
  lines.push('');
  return lines;
}

/**
 * Confidence is always shown. A finding a user cannot weigh is a finding they
 * cannot act on, and `low` here usually means the tool could not read part of
 * the repository.
 */
function confidenceLabel(confidence: Confidence): string {
  return confidence;
}

function location(file: string, zeroBasedLine: number): string {
  return `${file}:${zeroBasedLine + 1}`;
}

/**
 * Renders a policy check.
 *
 * The first run has no baseline, so everything is "introduced" and the output
 * says so plainly rather than dumping two hundred failures on a team that has
 * done nothing wrong yet. That first impression decides whether the check
 * survives its first week.
 */
export function renderCheck(result: RatchetResult, hasBaseline: boolean): string {
  const lines: string[] = [];

  if (!hasBaseline) {
    if (result.introduced.length === 0) return 'No policy violations.';
    lines.push(`${count(result.introduced.length, 'policy violation')}, and no baseline yet:`);
    lines.push('');
    for (const finding of result.introduced) lines.push(...violation(finding));
    lines.push('Run "flag-marshal check --update-baseline" to accept these as existing');
    lines.push('debt. CI will then fail only on violations added after that point.');
    return lines.join('\n').trimEnd();
  }

  if (result.introduced.length === 0) {
    lines.push('No new policy violations.');
  } else {
    lines.push(`${count(result.introduced.length, 'new policy violation')}:`);
    lines.push('');
    for (const finding of result.introduced) lines.push(...violation(finding));
  }

  if (result.accepted.length > 0) {
    lines.push(
      `${count(result.accepted.length, 'existing violation')} still accepted by the baseline.`,
    );
  }
  if (result.resolved.length > 0) {
    const verb = result.resolved.length === 1 ? 'no longer occurs' : 'no longer occur';
    lines.push(`${count(result.resolved.length, 'baselined violation')} ${verb} — debt paid off.`);
    lines.push('Run "flag-marshal check --update-baseline" to tighten the ratchet.');
  }

  return lines.join('\n').trimEnd();
}

function violation(finding: Finding): string[] {
  const lines = [`  ${fillTitle(finding)}`];
  if (finding.range !== undefined) {
    lines.push(`      ${location(finding.range.file, finding.range.start.line)}`);
  }
  lines.push('');
  return lines;
}

/** The short form of a commit, as git prints it. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 8);
}

/**
 * Renders what one change did to the flag inventory.
 *
 * Only the change: a reviewer looking at a branch wants to know what it adds,
 * not to reread the whole repository's debt. The full inventory is still in
 * `--json`, and `scan` without the option still prints it.
 */
export function renderChanges(changes: ChangeSet): string {
  const since = `${changes.since.ref} (merge base ${shortCommit(changes.since.commit)})`;
  const findings = changes.introducedFindings.filter((f) => f.id !== 'flag.unresolved-key');
  const resolved = changes.resolvedFindings.filter((f) => f.id !== 'flag.unresolved-key');

  const parts = [
    changes.addedFlags.length > 0 ? `${count(changes.addedFlags.length, 'flag')} added` : '',
    changes.removedFlags.length > 0 ? `${count(changes.removedFlags.length, 'flag')} removed` : '',
    changes.changedFlags.length > 0
      ? `${count(changes.changedFlags.length, 'flag')} with changed references`
      : '',
    findings.length > 0 ? `${count(findings.length, 'finding')} introduced` : '',
    resolved.length > 0 ? `${count(resolved.length, 'finding')} resolved` : '',
    changes.introducedUnresolved.length > 0
      ? `${count(changes.introducedUnresolved.length, 'unresolved key')} introduced`
      : '',
    changes.resolvedUnresolved.length > 0
      ? `${count(changes.resolvedUnresolved.length, 'unresolved key')} resolved`
      : '',
  ].filter((part) => part !== '');

  if (parts.length === 0) return `No flag changes since ${since}.`;

  const lines = [`Changes since ${since}:`, `  ${parts.join(', ')}`, ''];

  if (changes.addedFlags.length > 0) {
    lines.push('Flags added:');
    for (const key of changes.addedFlags) lines.push(`  ${key}`);
    lines.push('');
  }
  if (changes.removedFlags.length > 0) {
    lines.push('Flags removed:');
    for (const key of changes.removedFlags) lines.push(`  ${key}`);
    lines.push('');
  }
  if (changes.changedFlags.length > 0) {
    lines.push('References changed:');
    for (const flag of changes.changedFlags) {
      lines.push(`  ${flag.key}  ${flag.referencesBefore} -> ${flag.referencesAfter}`);
    }
    lines.push('');
  }
  if (findings.length > 0) {
    lines.push('Findings introduced:');
    lines.push('');
    for (const finding of findings) {
      lines.push(`  ${fillTitle(finding)}  [${confidenceLabel(finding.confidence)}]`);
      if (finding.range !== undefined) {
        lines.push(`      ${location(finding.range.file, finding.range.start.line)}`);
      }
      lines.push(`      why: ${evidenceSummary(finding)}`);
      lines.push('');
    }
  }
  if (resolved.length > 0) {
    lines.push('Findings resolved:');
    for (const finding of resolved) lines.push(`  ${fillTitle(finding)}`);
    lines.push('');
  }
  if (changes.introducedUnresolved.length > 0) {
    lines.push('Unresolved keys introduced (computed, so not read; never guessed):');
    for (const ref of changes.introducedUnresolved) {
      const where = location(ref.range.file, ref.range.start.line);
      lines.push(`  ${where}  [${ref.provider}]  ${ref.expression ?? ''}`.trimEnd());
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/** Renders `check --changed-since`: what this change would fail on. */
export function renderCheckSince(
  ref: string,
  introduced: readonly Finding[],
  resolved: readonly Finding[],
): string {
  const lines: string[] = [];
  if (introduced.length === 0) {
    lines.push(`No new policy violations since ${ref}.`);
  } else {
    lines.push(`${count(introduced.length, 'new policy violation')} since ${ref}:`);
    lines.push('');
    for (const finding of introduced) lines.push(...violation(finding));
  }
  if (resolved.length > 0) {
    const verb = resolved.length === 1 ? 'is' : 'are';
    lines.push(
      `${count(resolved.length, 'policy violation')} from ${ref} ${verb} fixed by this change.`,
    );
  }
  return lines.join('\n').trimEnd();
}
