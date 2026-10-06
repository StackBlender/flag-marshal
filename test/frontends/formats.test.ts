import { describe, expect, it } from 'vitest';
import type { Finding, ScanReport, Trend } from '../../src/core/api/index.js';
import { renderMarkdown } from '../../src/frontends/cli/render-markdown.js';
import { renderSarif } from '../../src/frontends/cli/render-sarif.js';

const range = {
  file: 'src/a.ts',
  start: { line: 4, character: 2 },
  end: { line: 4, character: 8 },
};

const finding: Finding = {
  id: 'flag.missing-owner',
  flagKey: 'alpha',
  severity: 'error',
  confidence: 'high',
  evidence: [{ kind: 'declared-owner', detail: false }],
  range,
};

const budget: Finding = {
  id: 'flag.budget-exceeded',
  flagKey: null,
  severity: 'error',
  confidence: 'high',
  evidence: [
    { kind: 'flag-count', detail: 42 },
    { kind: 'budget', detail: 10 },
  ],
};

function report(findings: Finding[] = [finding]): ScanReport {
  return {
    schemaVersion: '1.0',
    tool: { name: 'flag-marshal', coreVersion: '0.0.0' },
    root: '/w',
    positionEncoding: 'utf-16',
    flags: [],
    unresolvedReferences: [],
    unsupportedProviders: [],
    findings,
  };
}

describe('sarif', () => {
  const sarif = () => JSON.parse(renderSarif(report([finding, budget])));

  it('declares SARIF 2.1.0 with one run', () => {
    const doc = sarif();
    expect(doc.version).toBe('2.1.0');
    expect(doc.runs).toHaveLength(1);
  });

  it('converts positions to 1-based, as SARIF requires', () => {
    // The contract stores 0-based; SARIF is 1-based in both line and column.
    // Getting this wrong puts every annotation on the wrong line.
    const region = sarif().runs[0].results[0].locations[0].physicalLocation.region;
    expect(region.startLine).toBe(range.start.line + 1);
    expect(region.startColumn).toBe(range.start.character + 1);
    expect(region.endLine).toBe(range.end.line + 1);
    expect(region.endColumn).toBe(range.end.character + 1);
  });

  it('maps info severity to the SARIF note level', () => {
    const doc = JSON.parse(renderSarif(report([{ ...finding, severity: 'info' }])));
    expect(doc.runs[0].results[0].level).toBe('note');
  });

  it('emits a rule descriptor per distinct finding id', () => {
    const rules = sarif().runs[0].tool.driver.rules;
    expect(rules.map((r: { id: string }) => r.id)).toEqual([
      'flag.budget-exceeded',
      'flag.missing-owner',
    ]);
  });

  it('omits locations for a finding with no range rather than inventing one', () => {
    const result = sarif().runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === 'flag.budget-exceeded',
    );
    expect(result.locations).toBeUndefined();
  });

  it('carries confidence into the message, since SARIF has no field for it', () => {
    expect(sarif().runs[0].results[0].message.text).toContain('confidence: high');
  });

  it('substitutes every placeholder', () => {
    expect(renderSarif(report([budget]))).not.toMatch(/\{\w+\}/);
  });
});

describe('markdown', () => {
  it('leads with a headline a reader can absorb in one line', () => {
    const text = renderMarkdown(report());
    expect(text.split('\n')[0]).toBe('## Flag Marshal');
    expect(text).toContain('**1** finding');
  });

  it('folds the detail away so a PR timeline is not flooded', () => {
    expect(renderMarkdown(report())).toContain('<details>');
  });

  it('escapes pipes so catalog text cannot break the table', () => {
    const nasty: Finding = { ...finding, flagKey: 'a|b' };
    const row = renderMarkdown(report([nasty]))
      .split('\n')
      .find((l) => l.includes('a|b'));
    expect(row).toContain('a\\|b');
  });

  it('prints 1-based line numbers', () => {
    expect(renderMarkdown(report())).toContain('src/a.ts:5');
  });

  it('says so plainly when there is nothing to report', () => {
    expect(renderMarkdown(report([]))).toContain('No feature flags found');
  });

  it('shows the direction of travel when a trend is supplied', () => {
    const trend: Trend = {
      points: [
        { commit: 'a', timestamp: 1, accepted: 9 },
        { commit: 'b', timestamp: 2, accepted: 4 },
      ],
      change: -5,
    };
    expect(renderMarkdown(report(), trend)).toContain('down ↓ 5');
  });

  it('omits the trend line when there is only one data point', () => {
    const trend: Trend = { points: [{ commit: 'a', timestamp: 1, accepted: 9 }], change: 0 };
    expect(renderMarkdown(report(), trend)).not.toContain('since the first baseline');
  });

  it('substitutes every placeholder', () => {
    expect(renderMarkdown(report([budget]))).not.toMatch(/\{\w+\}/);
  });
});
