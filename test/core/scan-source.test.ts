import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIndex, scanSource, type SourceFile } from '../../src/core/api/index.js';

/**
 * Detection requires the SDK import, so inline snippets carry one. Bare method
 * names are deliberately not enough — see `src/core/detect/provider-identity.ts`.
 */
const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\n";

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'fixtures');

function file(fixture: string, path: string): SourceFile {
  return { path, text: readFileSync(resolve(FIXTURES, fixture, path), 'utf8') };
}

describe('scanSource', () => {
  it('finds every LaunchDarkly call site in a TypeScript file', async () => {
    const refs = await scanSource(file('ts-launchdarkly', 'src/checkout.ts'));

    expect(refs.map((r) => r.key)).toEqual(['checkout-v2', 'express-shipping']);
    for (const ref of refs) {
      expect(ref.provider).toBe('launchdarkly');
      expect(ref.language).toBe('typescript');
      expect(ref.resolution).toBe('resolved');
      expect(ref.kind).toBe('production-code');
    }
  });

  it('reports ranges that cover the key literal including its quotes', async () => {
    const [first] = await scanSource(file('ts-launchdarkly', 'src/checkout.ts'));
    expect(first?.range).toEqual({
      file: 'src/checkout.ts',
      start: { line: 5, character: 29 },
      end: { line: 5, character: 42 },
    });
  });

  it('returns references in deterministic order', async () => {
    const source = file('ts-launchdarkly', 'src/checkout.ts');
    const a = await scanSource(source);
    const b = await scanSource(source);
    expect(a).toEqual(b);
  });

  it('is silent on a file with no flags', async () => {
    expect(await scanSource(file('no-flags', 'src/math.ts'))).toEqual([]);
  });

  it('ignores a file no wired grammar claims', async () => {
    expect(await scanSource({ path: 'notes.md', text: '# hello' })).toEqual([]);
    expect(await scanSource({ path: 'Makefile', text: 'all:' })).toEqual([]);
  });

  it('classifies test files as test-code', async () => {
    const refs = await scanSource({
      path: 'src/thing.test.ts',
      text: LD + "client.variation('from-a-test', u, false);",
    });
    expect(refs.map((r) => r.kind)).toEqual(['test-code']);
  });

  it('recognizes the typed variation helpers, not just variation()', async () => {
    const refs = await scanSource({
      path: 'src/typed.ts',
      text:
        LD +
        [
          "client.boolVariation('a', u, false);",
          "client.stringVariation('b', u, '');",
          "client.jsonVariationDetail('c', u, null);",
        ].join('\n'),
    });
    expect(refs.map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('survives a file that does not parse cleanly', async () => {
    const refs = await scanSource({
      path: 'src/broken.ts',
      // The syntax error follows a well-formed call: the point is that a broken
      // file does not abort the scan, not that a mangled expression is trusted.
      text: LD + "client.variation('still-found', u, false);\nfunction ( {",
    });
    expect(refs.map((r) => r.key)).toContain('still-found');
  });
});

describe('scanSource never guesses a key', () => {
  it('reports a concatenated key as unresolved, keeping the source text', async () => {
    const refs = await scanSource(file('computed-keys', 'src/dynamic.ts'));
    const unresolved = refs.filter((r) => r.resolution === 'unresolved');

    expect(unresolved).toHaveLength(2);
    expect(unresolved.map((r) => r.expression)).toEqual(['PREFIX + name', 'key']);
    for (const ref of unresolved) {
      expect(ref.key, 'an invented key is worse than no key').toBeNull();
    }
  });

  it('still resolves the genuine literal in the same file', async () => {
    const refs = await scanSource(file('computed-keys', 'src/dynamic.ts'));
    const resolved = refs.filter((r) => r.resolution === 'resolved');
    expect(resolved.map((r) => r.key)).toEqual(['audit-log']);
  });

  it('treats a template literal with no interpolation as a real literal', async () => {
    const refs = await scanSource({
      path: 'src/tpl.ts',
      text: LD + 'client.variation(`plain-key`, u, false);',
    });
    expect(refs.map((r) => r.key)).toEqual(['plain-key']);
    expect(refs[0]?.resolution).toBe('resolved');
  });

  it('refuses to resolve a template literal with interpolation', async () => {
    const refs = await scanSource({
      path: 'src/tpl.ts',
      text: LD + 'client.variation(`prefix-${name}`, u, false);',
    });
    expect(refs[0]?.key).toBeNull();
    expect(refs[0]?.resolution).toBe('unresolved');
    expect(refs[0]?.expression).toBe('`prefix-${name}`');
  });
});

describe('buildIndex', () => {
  it('merges one key referenced from two files into a single record', async () => {
    const refs = [
      ...(await scanSource(file('ts-launchdarkly', 'src/checkout.ts'))),
      ...(await scanSource(file('ts-launchdarkly', 'src/pricing.ts'))),
    ];
    const index = buildIndex(refs);

    expect(index.flags.map((f) => f.key)).toEqual(['checkout-v2', 'express-shipping']);
    const checkout = index.flags.find((f) => f.key === 'checkout-v2');
    expect(checkout?.references.map((r) => r.range.file)).toEqual([
      'src/checkout.ts',
      'src/pricing.ts',
    ]);
  });

  it('separates unresolved references from the flag inventory', async () => {
    const index = buildIndex(await scanSource(file('computed-keys', 'src/dynamic.ts')));

    expect(index.flags.map((f) => f.key)).toEqual(['audit-log']);
    expect(index.unresolvedReferences).toHaveLength(2);
  });

  it('orders flags by key and leaves evidence unset', async () => {
    const index = buildIndex(await scanSource(file('ts-launchdarkly', 'src/checkout.ts')));
    const keys = index.flags.map((f) => f.key);

    expect(keys).toEqual([...keys].sort());
    for (const flag of index.flags) {
      expect(flag.evidence, 'evidence arrives in Milestone 5').toEqual([]);
      expect(flag.confidence, 'no evidence means unknown, not a placeholder').toBe('unknown');
    }
  });

  it('produces an empty index from no references', () => {
    expect(buildIndex([])).toEqual({ flags: [], unresolvedReferences: [] });
  });
});
