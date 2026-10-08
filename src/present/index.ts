/**
 * Wording shared by every frontend.
 *
 * The core emits structured findings and no human-facing strings; the catalog
 * holds the strings. This layer sits between them: it fills a catalog message's
 * placeholders from a finding's evidence, and turns evidence into the "why" line
 * that keeps a claim from being asserted bare.
 *
 * It lives outside `core/` because it produces prose, and outside `frontends/`
 * because the CLI, VS Code, and IntelliJ must say the same thing. When this logic
 * lived in the CLI, the only way for a second frontend to reuse it was to copy it,
 * and a copied vocabulary drifts.
 *
 * Constraints, enforced by `test/architecture/boundaries.test.ts`:
 * it imports `core/api` and nothing deeper, no frontend, and no editor or
 * platform API. It renders text, never layout — no terminal escapes, no markdown,
 * no HTML. Where a frontend arranges those strings is the frontend's business.
 */

import { messageCatalog, type Finding } from '../core/api/index.js';

/**
 * Which evidence item fills which placeholder.
 *
 * The catalog declares the placeholders a message expects; this says where their
 * values come from. A message rendered with a literal `{count}` in it is the
 * visible symptom of a missing entry here, which is why
 * `test/frontends/render.test.ts` asserts no rendered title ever contains one.
 */
const PLACEHOLDER_EVIDENCE: Record<string, Finding['evidence'][number]['kind']> = {
  count: 'flag-count',
  budget: 'budget',
  expiry: 'declared-expiry',
  daysOverdue: 'age-since-introduced',
  referenceCount: 'reference-count',
  ageDays: 'age-since-introduced',
};

/**
 * All wording comes from the message catalog, never from a frontend. That is what
 * keeps the CLI, VS Code, and IntelliJ from drifting into three different
 * vocabularies for the same finding.
 */
export function fillTitle(finding: Finding): string {
  const entry = messageCatalog[finding.id];
  let text = entry.title.replaceAll('{key}', finding.flagKey ?? '(unresolved)');

  for (const [placeholder, kind] of Object.entries(PLACEHOLDER_EVIDENCE)) {
    if (!text.includes(`{${placeholder}}`)) continue;
    const value = finding.evidence.find((item) => item.kind === kind)?.detail;
    if (value !== undefined && value !== null) {
      text = text.replaceAll(`{${placeholder}}`, String(value));
    }
  }
  return text;
}

/** Renders the evidence that produced the claim, so nothing is asserted bare. */
export function evidenceSummary(finding: Finding): string {
  const parts: string[] = [];
  for (const item of finding.evidence) {
    switch (item.kind) {
      case 'absent-from-code':
        parts.push('no code references it');
        break;
      case 'absent-from-configuration':
        parts.push('no configuration defines it');
        break;
      case 'test-only-references':
        parts.push('every reference is in test code');
        break;
      case 'reference-count':
        parts.push(count(Number(item.detail), 'reference'));
        break;
      case 'unreadable-languages':
        parts.push(`sources not read: ${String(item.detail)}`);
        break;
      case 'module-spread':
        parts.push(`spans ${count(Number(item.detail), 'module')}`);
        break;
      case 'age-since-introduced':
        // An expired flag carries its days overdue here, which is not its age.
        parts.push(
          finding.id === 'flag.expired'
            ? `${ageLabel(item.detail)} past its expiry`
            : `introduced ${ageLabel(item.detail)} ago`,
        );
        break;
      case 'time-since-last-modified':
        parts.push(`last changed ${ageLabel(item.detail)} ago`);
        break;
      case 'declared-owner':
        parts.push(
          typeof item.detail === 'string' ? `owner ${item.detail}` : 'no owner is declared',
        );
        break;
      case 'declared-expiry':
        parts.push(
          typeof item.detail === 'string' ? `expiry ${item.detail}` : 'no expiry is declared',
        );
        break;
      case 'flag-count':
        parts.push(count(Number(item.detail), 'flag'));
        break;
      case 'budget':
        parts.push(`a budget of ${String(item.detail)}`);
        break;
      default:
        parts.push(`${item.kind}: ${String(item.detail)}`);
    }
  }
  return parts.join('; ');
}

/** Days rendered the way a person would say them. */
export function ageLabel(detail: unknown): string {
  const days = typeof detail === 'number' ? detail : Number.NaN;
  if (!Number.isFinite(days)) return String(detail);
  if (days < 1) return 'today';
  if (days < 60) return `${days} days`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} months`;
  return `${(days / 365).toFixed(1)} years`;
}

/** `1 reference`, `2 references`. Pluralisation in one place, not three. */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
