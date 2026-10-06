import type { Finding, ScanReport, Trend } from '../../core/api/index.js';
import { fillTitle } from '../../present/index.js';
import {
  debtReasons,
  headlineParts,
  helperCandidates,
  rankByDebt,
  summarize,
} from '../../present/summary.js';

/** A PR comment shows only the top of the ranking; the rest is in the inventory. */
const RANKING_LIMIT = 5;

/**
 * A pull-request comment.
 *
 * Written to be read in ten seconds by someone who did not ask for it: a headline
 * number first, then the detail behind a fold. A PR comment that dumps two
 * hundred rows into the timeline gets the bot muted.
 */
export function renderMarkdown(report: ScanReport, trend?: Trend): string {
  const lines: string[] = ['## Flag Marshal', ''];
  const unsupported = report.unsupportedProviders ?? [];

  const flags = report.flags.length;
  const unresolved = report.unresolvedReferences.length;
  const findings = report.findings.filter((f) => f.id !== 'flag.unresolved-key');

  // Unresolved calls count: a repository whose only flag call is inside a helper
  // was reported as having no flags, which hid the one line that explains why.
  if (flags === 0 && findings.length === 0 && unsupported.length === 0 && unresolved === 0) {
    lines.push('No feature flags found.');
    return lines.join('\n');
  }

  lines.push(
    `**${flags}** ${plural(flags, 'flag')} · **${findings.length}** ${plural(findings.length, 'finding')}` +
      (unresolved > 0 ? ` · **${unresolved}** unresolved` : ''),
  );

  // Unresolved keys are already counted in the line above.
  const headline = headlineParts({ ...summarize(report), unresolved: 0 });
  if (headline.length > 0) lines.push('', headline.join(' · '));

  if (trend !== undefined && trend.points.length > 1) {
    const arrow = trend.change < 0 ? '↓' : trend.change > 0 ? '↑' : '→';
    const word = trend.change < 0 ? 'down' : trend.change > 0 ? 'up' : 'flat';
    lines.push(
      '',
      `Accepted debt is ${word} ${arrow} ${Math.abs(trend.change)} since the first baseline.`,
    );
  }

  if (unsupported.length > 0) {
    const names = unsupported.map((p) => p.name).join(', ');
    lines.push(
      '',
      `> **Incomplete inventory.** ${names} ${unsupported.length === 1 ? 'is' : 'are'} in use but not supported yet, so flags managed by ${unsupported.length === 1 ? 'it' : 'them'} are missing from these counts.`,
    );
  }

  // Outside the fold: this is the part someone forwards.
  const ranked = rankByDebt(report, RANKING_LIMIT);
  if (ranked.length > 0) {
    lines.push('', '| Worth reviewing first | Debt score | Why |');
    lines.push('| --- | --- | --- |');
    for (const flag of ranked) {
      const why = escape(debtReasons(flag).join('; '));
      lines.push(`| \`${flag.key}\` | ${flag.debtScore ?? 0} | ${why} |`);
    }
  }

  if (findings.length > 0) {
    lines.push('', '<details>', `<summary>${findings.length} findings</summary>`, '');
    lines.push('| Finding | Flag | Confidence | Location |');
    lines.push('| --- | --- | --- | --- |');
    for (const finding of findings) lines.push(row(finding));
    lines.push('', '</details>');
  }

  if (unresolved > 0) {
    lines.push(
      '',
      `> ${unresolved} ${plural(unresolved, 'call site')} ${unresolved === 1 ? 'computes its' : 'compute their'} flag key, so it could not be`,
      '> read from the source. These are reported rather than guessed.',
    );
    const helpers = helperCandidates(report);
    if (helpers.length > 0) {
      const names = helpers.map((name) => `\`${name}\``).join(', ');
      lines.push(
        '>',
        `> Likely flag helpers: ${names}. Declaring them under \`customPatterns.methods\` in`,
        '> `.flagmarshal.yml` reads each of their calls instead.',
      );
    }
  }

  return lines.join('\n');
}

function row(finding: Finding): string {
  const where =
    finding.range === undefined ? '—' : `\`${finding.range.file}:${finding.range.start.line + 1}\``;
  const key = finding.flagKey === null ? '—' : `\`${finding.flagKey}\``;
  return `| ${escape(fillTitle(finding))} | ${key} | ${finding.confidence} | ${where} |`;
}

/** Pipes would break the table; the message catalog is user-facing text. */
function escape(text: string): string {
  return text.replaceAll('|', '\\|');
}

function plural(n: number, noun: string): string {
  return n === 1 ? noun : `${noun}s`;
}
