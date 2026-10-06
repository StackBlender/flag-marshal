import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIndex, GRAMMARS, grammarFor, scanSource } from '../../src/core/api/index.js';
import { unparsedLanguageOf } from '../../src/core/detect/unparsed.js';

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'fixtures');
const read = (fixture: string, path: string) => ({
  path,
  text: readFileSync(resolve(FIXTURES, fixture, path), 'utf8'),
});

/** Detection requires the SDK import; inline snippets carry a realistic one. */
const IMPORT = {
  ld_java: 'import com.launchdarkly.sdk.server.LDClient;\nclass Holder { LDClient client; }\n',
  unleash_kt: 'import io.getunleash.Unleash\nval unleash: Unleash = TODO()\n',
  of_ts:
    "import { OpenFeature } from '@openfeature/server-sdk';\nconst client = OpenFeature.getClient();\n",
  of_java: 'import dev.openfeature.sdk.Client;\nclass Holder { Client client; }\n',
  of_kt: 'import dev.openfeature.sdk.Client\nval client: Client = TODO()\n',
};

describe('wired grammars', () => {
  it.each(['a.ts', 'a.js', 'A.java', 'A.kt', 'a.kts'])('claims %s', (path) => {
    expect(grammarFor(path)).toBeDefined();
  });

  it('never lists a wired language as unreadable', () => {
    // A language in both lists would cap confidence for no reason at all.
    const wired = GRAMMARS.flatMap((g) => g.extensions);
    const overlap = wired.filter((ext) => unparsedLanguageOf(`a${ext}`) !== undefined);
    expect(overlap).toEqual([]);
  });
});

describe('java', () => {
  it('finds LaunchDarkly call sites', async () => {
    const refs = await scanSource(
      read('mixed-polyglot', 'service/src/main/java/com/example/BillingService.java'),
    );
    expect(refs.map((r) => r.key)).toEqual(['unified-billing']);
    expect(refs[0]?.language).toBe('java');
    expect(refs[0]?.provider).toBe('launchdarkly');
  });

  it('finds Spring @ConditionalOnProperty in both supported forms', async () => {
    const refs = await scanSource({
      path: 'A.java',
      text: [
        'class A {',
        '  @ConditionalOnProperty(name = "features.named", havingValue = "true")',
        '  void a() {}',
        '  @ConditionalOnProperty("features.shorthand")',
        '  void b() {}',
        '}',
      ].join('\n'),
    });
    expect(refs.map((r) => r.key).sort()).toEqual(['features.named', 'features.shorthand']);
    expect(refs.every((r) => r.provider === 'spring-conditional')).toBe(true);
  });

  it('ignores an unrelated annotation', async () => {
    const refs = await scanSource({
      path: 'A.java',
      text: 'class A { @RequestMapping(name = "not-a-flag") void a() {} }',
    });
    expect(refs).toEqual([]);
  });

  it('reports a computed Java key as unresolved', async () => {
    const refs = await scanSource({
      path: 'A.java',
      text:
        IMPORT.ld_java + 'class A { void m() { client.boolVariation(PREFIX + name, u, false); } }',
    });
    expect(refs[0]?.resolution).toBe('unresolved');
    expect(refs[0]?.key).toBeNull();
  });
});

describe('kotlin', () => {
  it('finds Unleash call sites', async () => {
    const refs = await scanSource(read('kotlin-unleash', 'src/Search.kt'));
    expect(refs.map((r) => r.key)).toEqual(['search-ranking-v3', 'typeahead']);
    expect(refs.every((r) => r.language === 'kotlin')).toBe(true);
    expect(refs.every((r) => r.provider === 'unleash')).toBe(true);
  });

  it('refuses to resolve a Kotlin string template', async () => {
    const refs = await scanSource({
      path: 'A.kt',
      text: IMPORT.unleash_kt + 'fun f() { unleash.isEnabled("prefix-$name") }',
    });
    expect(refs[0]?.key).toBeNull();
    expect(refs[0]?.resolution).toBe('unresolved');
  });

  it('refuses to resolve the brace-less $name form', async () => {
    // This one has no interpolation node in the parse tree at all — the shape is
    // identical to a plain string — so it has to be caught in the text.
    const refs = await scanSource({
      path: 'A.kt',
      text: IMPORT.unleash_kt + 'fun f() { unleash.isEnabled("prefix-$name") }',
    });
    expect(refs[0]?.key, 'a key of "prefix-$name" would be invented nonsense').toBeNull();
  });

  it('resolves a plain Kotlin string', async () => {
    const refs = await scanSource({
      path: 'A.kt',
      text: IMPORT.unleash_kt + 'fun f() { unleash.isEnabled("plain") }',
    });
    expect(refs.map((r) => r.key)).toEqual(['plain']);
  });

  it('treats an escaped dollar sign as an ordinary character', async () => {
    const refs = await scanSource({
      path: 'A.kt',
      text: IMPORT.unleash_kt + 'fun f() { unleash.isEnabled("costs \\$5") }',
    });
    expect(refs[0]?.resolution).toBe('resolved');
  });
});

describe('openfeature', () => {
  it.each([
    ['a.ts', IMPORT.of_ts + 'client.getBooleanValue("of-ts", false);'],
    [
      'A.java',
      IMPORT.of_java + 'class A { void m() { client.getBooleanValue("of-java", false); } }',
    ],
    ['A.kt', IMPORT.of_kt + 'fun f() { client.getBooleanValue("of-kt", false) }'],
  ])('is recognized in %s', async (path, text) => {
    const refs = await scanSource({ path, text });
    expect(refs).toHaveLength(1);
    expect(refs[0]?.provider).toBe('openfeature');
  });
});

describe('one key across two languages', () => {
  it('becomes a single record with two references', async () => {
    const refs = [
      ...(await scanSource(read('mixed-polyglot', 'web/src/banner.ts'))),
      ...(await scanSource(
        read('mixed-polyglot', 'service/src/main/java/com/example/BillingService.java'),
      )),
    ];
    const index = buildIndex(refs);

    expect(index.flags).toHaveLength(1);
    expect(index.flags[0]?.references.map((r) => r.language).sort()).toEqual([
      'java',
      'typescript',
    ]);
  });
});
