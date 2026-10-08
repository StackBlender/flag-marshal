import { createHash } from 'node:crypto';
import {
  SETTINGS_FILE,
  type Finding,
  type ScanReport,
  type Severity,
} from '../../core/api/index.js';
import { evidenceSummary, fillTitle } from '../../present/index.js';

/**
 * Renderers for CI systems' own annotation formats.
 *
 * Both take `prefix`, the scanned root relative to the working directory, because
 * CI systems resolve paths against the checkout, not against whatever directory
 * was scanned. Positions are 1-based here, converted from the 0-based contract at
 * this edge like every other renderer.
 */

const GITHUB_COMMAND: Record<Severity, string> = {
  error: 'error',
  warning: 'warning',
  info: 'notice',
};

/**
 * GitHub Actions workflow commands, one line per finding.
 *
 * Printed to the log, they annotate the pull request's changed files directly,
 * with no upload step and no code-scanning licence: SARIF upload needs GitHub
 * Advanced Security on private repositories, and these do not.
 */
export function renderGithub(report: ScanReport, prefix: string): string {
  return report.findings
    .map((finding) => {
      const properties = [`title=${property(`Flag Marshal: ${finding.id}`)}`];
      if (finding.range !== undefined) {
        const { start, end } = finding.range;
        properties.unshift(
          `file=${property(join(prefix, finding.range.file))}`,
          `line=${start.line + 1}`,
          `endLine=${end.line + 1}`,
          `col=${start.character + 1}`,
          `endColumn=${end.character + 1}`,
        );
      }
      return `::${GITHUB_COMMAND[finding.severity]} ${properties.join(',')}::${data(message(finding))}`;
    })
    .join('\n');
}

/** Escaping for a workflow command's message, as the Actions runner defines it. */
function data(text: string): string {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/** Escaping for a property value, which also may not contain `:` or `,` raw. */
function property(text: string): string {
  return data(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

const CODE_QUALITY_SEVERITY: Record<Severity, string> = {
  error: 'major',
  warning: 'minor',
  info: 'info',
};

/**
 * GitLab's Code Quality report, which the merge request widget compares between
 * the source and target branches.
 *
 * The fingerprint is how GitLab tells a new issue from an old one, so it leaves
 * out the line: moving code is not a new issue, the same rule the baseline
 * follows. Alike findings in one file are numbered so each stays unique. A
 * finding with no position, such as the flag budget, is placed on the settings
 * file that declares the policy, because GitLab requires a path.
 */
export function renderCodeQuality(report: ScanReport, prefix: string): string {
  const seen = new Map<string, number>();
  const issues = report.findings.map((finding) => {
    const path = join(prefix, finding.range?.file ?? SETTINGS_FILE);
    const identity = `${finding.id}\0${finding.flagKey ?? ''}\0${path}`;
    const occurrence = seen.get(identity) ?? 0;
    seen.set(identity, occurrence + 1);
    return {
      description: message(finding),
      check_name: finding.id,
      fingerprint: createHash('sha256').update(`${identity}\0${occurrence}`).digest('hex'),
      severity: CODE_QUALITY_SEVERITY[finding.severity],
      location: { path, lines: { begin: (finding.range?.start.line ?? 0) + 1 } },
    };
  });
  return JSON.stringify(issues, null, 2);
}

function message(finding: Finding): string {
  const why = evidenceSummary(finding);
  const confidence = `confidence: ${finding.confidence}`;
  return why === ''
    ? `${fillTitle(finding)} (${confidence})`
    : `${fillTitle(finding)} (${confidence}). Why: ${why}`;
}

function join(prefix: string, file: string): string {
  return prefix === '' || prefix === '.' ? file : `${prefix}/${file}`;
}
