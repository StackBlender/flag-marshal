import {
  messageCatalog,
  type Finding,
  type ScanReport,
  type Severity,
} from '../../core/api/index.js';
import { fillTitle } from '../../present/index.js';

/**
 * SARIF 2.1.0, the format GitHub code scanning ingests.
 *
 * SARIF regions are **1-based** in both line and column, while the Flag Marshal
 * contract stores both 0-based. The conversion happens here, at the frontend's
 * edge, exactly like the human renderer's line numbers — see `docs/design.md`,
 * "Reuse across frontends".
 */
const LEVEL: Record<Severity, string> = { error: 'error', warning: 'warning', info: 'note' };

export function renderSarif(report: ScanReport): string {
  const rules = [...new Set(report.findings.map((f) => f.id))].sort().map((id) => ({
    id,
    name: id,
    shortDescription: { text: messageCatalog[id].rule },
    fullDescription: { text: messageCatalog[id].explanation },
    defaultConfiguration: { level: 'warning' },
  }));

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Flag Marshal',
            informationUri: 'https://github.com/StackBlender/flag-marshal',
            version: report.tool.coreVersion,
            rules,
          },
        },
        results: report.findings.map((finding) => result(finding)),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function result(finding: Finding): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ruleId: finding.id,
    level: LEVEL[finding.severity],
    message: { text: `${fillTitle(finding)} (confidence: ${finding.confidence})` },
  };

  if (finding.range === undefined) return base;

  return {
    ...base,
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.range.file },
          region: {
            startLine: finding.range.start.line + 1,
            startColumn: finding.range.start.character + 1,
            endLine: finding.range.end.line + 1,
            endColumn: finding.range.end.character + 1,
          },
        },
      },
    ],
  };
}
