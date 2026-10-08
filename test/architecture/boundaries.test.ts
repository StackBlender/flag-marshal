import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { SRC_ROOT, importsOf, sourceFiles } from './source-scan.js';

/**
 * Authoritative enforcement of the architecture boundary described in
 * docs/design.md, "Reuse across frontends". ESLint enforces the same rules for
 * fast feedback, but lint can be silenced with an inline disable comment and
 * this cannot.
 */
describe('architecture boundaries', () => {
  const coreFiles = sourceFiles(join(SRC_ROOT, 'core'));
  const frontendFiles = sourceFiles(join(SRC_ROOT, 'frontends'));
  const presentFiles = sourceFiles(join(SRC_ROOT, 'present'));

  it('has source to check', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
    expect(frontendFiles.length).toBeGreaterThan(0);
    expect(presentFiles.length).toBeGreaterThan(0);
  });

  it('core never imports a frontend', () => {
    const violations = coreFiles
      .flatMap(importsOf)
      .filter((ref) => ref.target?.startsWith('frontends/') ?? false)
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'core must not depend on any frontend').toEqual([]);
  });

  it('core never imports an editor or platform API', () => {
    const platform = new Set(['vscode', 'vscode-languageserver', 'vscode-uri']);
    const violations = coreFiles
      .flatMap(importsOf)
      .filter((ref) => platform.has(ref.specifier))
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'core emits structured data; editors belong in frontends').toEqual([]);
  });

  it('frontends import core/api only, never core internals', () => {
    const violations = frontendFiles
      .flatMap(importsOf)
      .filter((ref) => {
        const target = ref.target;
        if (target === undefined || !target.startsWith('core/')) return false;
        return target !== 'core/api' && !target.startsWith('core/api/');
      })
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(
      violations,
      'frontends may import core/api only; reaching deeper is what makes frontends drift apart',
    ).toEqual([]);
  });

  it('the presentation layer imports core/api only, never core internals', () => {
    const violations = presentFiles
      .flatMap(importsOf)
      .filter((ref) => {
        const target = ref.target;
        if (target === undefined || !target.startsWith('core/')) return false;
        return target !== 'core/api' && !target.startsWith('core/api/');
      })
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'shared wording gets the same core surface a frontend gets').toEqual([]);
  });

  it('the presentation layer never imports a frontend or an editor API', () => {
    // The moment shared wording depends on one frontend, it stops being shared
    // and the other frontends start keeping their own copy.
    const platform = new Set(['vscode', 'vscode-languageserver', 'vscode-uri']);
    const violations = presentFiles
      .flatMap(importsOf)
      .filter(
        (ref) => (ref.target?.startsWith('frontends/') ?? false) || platform.has(ref.specifier),
      )
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'shared wording must depend on nothing frontend-specific').toEqual([]);
  });

  it('no frontend authors finding wording of its own', () => {
    // Every human-facing finding string comes from catalog/messages.json through
    // src/present. A frontend that reads the catalog directly is one refactor
    // away from filling placeholders its own way, which is how three frontends
    // end up with three vocabularies for one finding.
    const violations = frontendFiles
      .flatMap(importsOf)
      .filter((ref) => ref.specifier.includes('messages.json'))
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'frontends render wording through src/present, not the catalog').toEqual([]);
  });

  it('no frontend imports an editor API', () => {
    // Flag Marshal is a command-line and CI tool; editor frontends were dropped
    // by the user on 2026-10-07. Bringing one back is a decision, not a drive-by.
    const platform = new Set(['vscode', 'vscode-languageserver', 'vscode-uri']);
    const violations = frontendFiles
      .flatMap(importsOf)
      .filter((ref) => platform.has(ref.specifier))
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'editor frontends were dropped 2026-10-07').toEqual([]);
  });
});
