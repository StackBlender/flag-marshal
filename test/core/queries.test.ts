import { describe, expect, it } from 'vitest';
import { Parser, Language, Query } from 'web-tree-sitter';
import { BUILT_IN_ADAPTERS, customAdapter, GRAMMARS } from '../../src/core/api/index.js';

/**
 * `scanWith` skips an adapter whose query fails to compile, so a user's scan is
 * never taken down by a bug in this codebase. That safety net would also hide
 * the bug, so this suite compiles every query against every grammar and fails CI
 * instead.
 */
describe('every adapter query compiles', () => {
  const adapters = [...BUILT_IN_ADAPTERS, customAdapter(['isFeatureOn'])].filter(
    (a) => a !== undefined,
  );

  it('has grammars and adapters to check', () => {
    expect(GRAMMARS.length).toBeGreaterThan(1);
    expect(adapters.length).toBeGreaterThan(1);
  });

  for (const spec of GRAMMARS) {
    for (const adapter of adapters) {
      it(`${adapter.id} against ${spec.id}`, async () => {
        await Parser.init();
        const language = await Language.load(spec.wasmPath);
        const source = adapter.queryFor(language, spec.id);
        if (source === undefined) return; // This provider has no presence here.

        let query: Query | undefined;
        expect(() => {
          query = new Query(language, source);
        }, `${adapter.id} query is invalid for ${spec.id}`).not.toThrow();
        query?.delete();
      });
    }
  }
});
