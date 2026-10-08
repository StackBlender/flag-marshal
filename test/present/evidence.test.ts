import { describe, expect, it } from 'vitest';
import type { Finding } from '../../src/core/api/index.js';
import { evidenceSummary } from '../../src/present/index.js';

const finding = (id: Finding['id'], evidence: Finding['evidence']): Finding => ({
  id,
  flagKey: 'k',
  severity: 'warning',
  confidence: 'high',
  evidence,
});

describe('evidenceSummary', () => {
  it('words policy evidence for people, not as raw evidence kinds', () => {
    expect(
      evidenceSummary(finding('flag.missing-owner', [{ kind: 'declared-owner', detail: false }])),
    ).toBe('no owner is declared');
    expect(
      evidenceSummary(finding('flag.missing-expiry', [{ kind: 'declared-expiry', detail: false }])),
    ).toBe('no expiry is declared');
    expect(
      evidenceSummary(
        finding('flag.budget-exceeded', [
          { kind: 'flag-count', detail: 12 },
          { kind: 'budget', detail: 10 },
        ]),
      ),
    ).toBe('12 flags; a budget of 10');
  });

  it('says how far past its expiry an expired flag is, not how old it is', () => {
    const expired = finding('flag.expired', [
      { kind: 'declared-expiry', detail: '2026-01-31' },
      { kind: 'age-since-introduced', detail: 30 },
    ]);
    expect(evidenceSummary(expired)).toBe('expiry 2026-01-31; 30 days past its expiry');
  });

  it('never prints a raw evidence kind for anything the policy emits', () => {
    for (const kind of ['declared-owner', 'declared-expiry', 'flag-count', 'budget'] as const) {
      const text = evidenceSummary(finding('flag.missing-owner', [{ kind, detail: false }]));
      expect(text).not.toContain(`${kind}:`);
    }
  });
});
