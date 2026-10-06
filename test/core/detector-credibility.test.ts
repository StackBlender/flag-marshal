import { describe, expect, it } from 'vitest';
import {
  importedModules,
  providersInScope,
  unsupportedProvidersIn,
} from '../../src/core/detect/provider-identity.js';
import { scanSource } from '../../src/core/api/index.js';
import {
  findTogglzEnums,
  indexTogglzEnums,
  packageOf,
  resolveTogglzEnum,
} from '../../src/core/detect/togglz-enums.js';
import { isTestPath } from '../../src/core/detect/test-paths.js';

/**
 * Regression cover for defects found by running against two real Spring
 * repositories. Every case below was wrong before.
 *
 * The principle at stake: missing an unsupported pattern is acceptable when
 * clearly represented; confidently labelling ordinary application code as
 * feature-flag debt is not.
 */
const keys = async (path: string, text: string) =>
  (await scanSource({ path, text })).map((r) => r.key);

const SPRING_KT = 'import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty\n';
const SPRING_JAVA =
  'import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;\n';

describe('Kotlin @ConditionalOnProperty arrays', () => {
  it('resolves a single literal inside name = [...]', async () => {
    // Was: the whole array reported as one computed key.
    const text = `${SPRING_KT}@ConditionalOnProperty(
    name = ["basic-auth.enabled"],
    havingValue = "true",
)
class A`;
    expect(await keys('A.kt', text)).toEqual(['basic-auth.enabled']);
  });

  it('resolves every literal when the array names several properties', async () => {
    const text = `${SPRING_KT}@ConditionalOnProperty(name = ["one.enabled", "two.enabled"])\nclass A`;
    expect(await keys('A.kt', text)).toEqual(['one.enabled', 'two.enabled']);
  });

  it('accepts the value alias as well as name', async () => {
    const text = `${SPRING_KT}@ConditionalOnProperty(value = ["aliased.enabled"])\nclass A`;
    expect(await keys('A.kt', text)).toEqual(['aliased.enabled']);
  });

  it('still reports a genuinely computed annotation value as unresolved', async () => {
    const text = `${SPRING_KT}@ConditionalOnProperty(name = [PREFIX + ".enabled"])\nclass A`;
    const refs = await scanSource({ path: 'A.kt', text });
    expect(refs[0]?.key, 'a computed key must never be invented').toBeNull();
    expect(refs[0]?.resolution).toBe('unresolved');
  });
});

describe('Java @ConditionalOnProperty arrays', () => {
  it('resolves every literal in name = {"one", "two"}', async () => {
    const text = `${SPRING_JAVA}class A { @ConditionalOnProperty(name = {"one", "two"}) void m() {} }`;
    expect(await keys('A.java', text)).toEqual(['one', 'two']);
  });

  it('still handles the single-string shorthand', async () => {
    const text = `${SPRING_JAVA}class A { @ConditionalOnProperty("solo.enabled") void m() {} }`;
    expect(await keys('A.java', text)).toEqual(['solo.enabled']);
  });
});

describe('ordinary code that shares a method name with an SDK', () => {
  it('does not treat a Lombok builder setter as Unleash', async () => {
    // AppSettingsAuditEvent.builder().isEnabled(isEnabled)
    const text =
      'class A { void m(boolean isEnabled) { AppSettingsAuditEvent.builder().isEnabled(isEnabled); } }';
    expect(await keys('A.java', text)).toEqual([]);
  });

  it('does not treat an application helper as OpenFeature', async () => {
    // getStringValue(intake, "most_recent_hospitalization_or_ed_visit")
    const text =
      'class A { String m(Intake i) { return getStringValue(i, "most_recent_visit"); } }';
    expect(await keys('A.java', text)).toEqual([]);
  });

  it('does not treat a domain method named variation as LaunchDarkly', async () => {
    expect(await keys('a.ts', "export const r = (p) => p.variation('standard');")).toEqual([]);
  });

  it('reports nothing at all rather than an uncertain candidate', async () => {
    // An unverified call must not surface as a "computed flag key" either.
    const refs = await scanSource({
      path: 'A.java',
      text: 'class A { void m() { thing.isEnabled(someVariable); } }',
    });
    expect(refs).toEqual([]);
  });
});

describe('legitimate SDK calls are still detected', () => {
  it.each([
    [
      'A.java',
      'import com.launchdarkly.sdk.server.LDClient;\nclass A { private LDClient c; void m() { c.boolVariation("ld", u, false); } }',
      'ld',
    ],
    [
      'A.kt',
      'import io.getunleash.Unleash\nclass A(private val unleash: Unleash) { fun f() { unleash.isEnabled("un") } }',
      'un',
    ],
    [
      'a.ts',
      "import { init } from 'launchdarkly-node-server-sdk';\nconst c = init('');\nc.variation('ts', u, false);",
      'ts',
    ],
    [
      'a.ts',
      "import { OpenFeature } from '@openfeature/server-sdk';\nconst c = OpenFeature.getClient();\nc.getBooleanValue('of', false);",
      'of',
    ],
  ])('%s', async (path, text, expected) => {
    expect(await keys(path, text)).toEqual([expected]);
  });
});

describe('keys that are literal but cannot name a flag', () => {
  // Found in the togglz repository: a test asserting that an empty feature name
  // is rejected. The string is genuinely there in the source, so the extractor is
  // right to read it — but an entry with no name in a flag inventory reads as a
  // bug in the analyzer, not as a finding about the code.
  it.each([
    [
      'A.java',
      'import org.togglz.core.feature.NamedFeature;\nclass A { void m() { new NamedFeature(""); } }',
    ],
    [
      'a.ts',
      "import { init } from 'launchdarkly-node-server-sdk';\nconst c = init('');\nc.variation('   ', u, false);",
    ],
  ])('%s reports nothing', async (path, text) => {
    expect(await keys(path, text)).toEqual([]);
  });

  it('still reports the other keys in the same file', async () => {
    const text =
      "import { init } from 'launchdarkly-node-server-sdk';\n" +
      "const c = init('');\n" +
      "c.variation('', u, false);\n" +
      "c.variation('real-flag', u, false);\n";
    expect(await keys('a.ts', text)).toEqual(['real-flag']);
  });
});

describe('Java fields are constants only when they say final', () => {
  const LD = 'import com.launchdarkly.sdk.server.LDClient;\n';

  it('resolves a final field', async () => {
    const text =
      LD +
      'class A { private static final String FLAG = "first";\n' +
      '  private LDClient c;\n' +
      '  void m() { c.boolVariation(FLAG, u, false); } }';
    expect(await keys('A.java', text)).toEqual(['first']);
  });

  it('does not resolve a non-final field written through this', async () => {
    // Reported by an external review against a live repository. "Effectively
    // final" is a claim about every write in a program; a field can be written
    // from any method or any other class holding a reference, none of which a
    // file-local pass can see. Reporting `first` here is a confidently wrong key,
    // which is worse than no key at all.
    const text =
      LD +
      'class A { String FLAG = "first";\n' +
      '  private LDClient c;\n' +
      '  void setFlag() { this.FLAG = "second"; }\n' +
      '  void m() { c.boolVariation(FLAG, u, false); } }';
    expect(await keys('A.java', text)).toEqual([null]);
  });

  it('does not resolve a non-final field even with no visible write', async () => {
    // The write may be in another file. `final` is the only local proof.
    const text =
      LD +
      'class A { String FLAG = "first";\n' +
      '  private LDClient c;\n' +
      '  void m() { c.boolVariation(FLAG, u, false); } }';
    expect(await keys('A.java', text)).toEqual([null]);
  });

  it('still resolves a local that is never reassigned', async () => {
    // Locals keep effectively-final treatment: every write to one is in view.
    const text =
      LD +
      'class A { private LDClient c;\n' +
      '  void m() { String key = "local-flag"; c.boolVariation(key, u, false); } }';
    expect(await keys('A.java', text)).toEqual(['local-flag']);
  });

  it('does not resolve a final field written through another receiver', async () => {
    const text =
      LD +
      'class A { String FLAG = "first";\n' +
      '  private LDClient c;\n' +
      '  void m(B other) { other.FLAG = "second"; c.boolVariation(FLAG, u, false); } }';
    expect(await keys('A.java', text)).toEqual([null]);
  });
});

describe('import scanning', () => {
  it('reads JVM, ES module, and CommonJS forms', () => {
    expect(importedModules('import com.launchdarkly.sdk.server.LDClient;')).toContain(
      'com.launchdarkly.sdk.server.LDClient',
    );
    expect(importedModules("import { init } from 'launchdarkly-node-server-sdk';")).toContain(
      'launchdarkly-node-server-sdk',
    );
    expect(importedModules("const ld = require('launchdarkly-node-server-sdk');")).toContain(
      'launchdarkly-node-server-sdk',
    );
  });

  it('does not unlock a provider named only in a comment or a string', () => {
    // Otherwise a file merely discussing LaunchDarkly would start reporting flags.
    const text = '// we used to use com.launchdarkly here\nconst s = "unleash";\n';
    expect(providersInScope(text).size).toBe(0);
  });

  it('recognizes each supported provider from its import', () => {
    expect(
      providersInScope('import com.launchdarkly.sdk.server.LDClient;').has('launchdarkly'),
    ).toBe(true);
    expect(providersInScope('import io.getunleash.Unleash').has('unleash')).toBe(true);
    expect(
      providersInScope("import { OpenFeature } from '@openfeature/server-sdk';").has('openfeature'),
    ).toBe(true);
  });
});

describe('same-file collisions', () => {
  it('separates a real SDK call from a builder in the same file', async () => {
    // Reported from acmeco-webapp: importing Unleash must not turn every
    // `.isEnabled(...)` in the file into a flag reference.
    const text = [
      'import io.getunleash.Unleash;',
      'class A {',
      '  private final Unleash unleash;',
      '  void m(boolean enabled) {',
      '    Builder.builder().isEnabled(enabled);',
      '    unleash.isEnabled("real-flag");',
      '  }',
      '}',
    ].join('\n');

    const refs = await scanSource({ path: 'A.java', text });
    expect(refs.map((r) => r.key)).toEqual(['real-flag']);
    expect(refs, 'the builder call must not appear even as unresolved').toHaveLength(1);
  });

  it('ignores a bare helper call in a file that imports an SDK', async () => {
    const text = [
      'import com.launchdarkly.sdk.server.LDClient;',
      'class A {',
      '  private LDClient client;',
      '  String m(Intake i) { return getStringValue(i, "field"); }',
      '}',
    ].join('\n');
    expect(await keys('A.java', text)).toEqual([]);
  });

  it('accepts a client reached through this', async () => {
    const text = [
      'import com.launchdarkly.sdk.server.LDClient;',
      'class A {',
      '  private LDClient client;',
      '  void m() { this.client.boolVariation("via-this", u, false); }',
      '}',
    ].join('\n');
    expect(await keys('A.java', text)).toEqual(['via-this']);
  });
});

describe('togglz', () => {
  const TOGGLZ = 'import org.togglz.core.Feature;\n';

  it('inventories enum constants as flags once discovery has verified the enum', async () => {
    // A single-file scan cannot know whether `implements Feature` means Togglz.
    // Only the discovery pass, which reads imports, can — so declarations are
    // filtered through it exactly like usages.
    const text = `${TOGGLZ}public enum Flags implements Feature { NEW_CHECKOUT, LEGACY_EXPORT; }`;
    const enums = indexTogglzEnums([
      {
        name: 'Flags',
        qualifiedName: 'Flags',
        constants: new Set(['NEW_CHECKOUT', 'LEGACY_EXPORT']),
      },
    ]);

    const found = await scanSource({ path: 'Flags.java', text }, { togglzEnums: enums });
    expect(found.map((r) => r.key)).toEqual(['NEW_CHECKOUT', 'LEGACY_EXPORT']);
  });

  it('finds usages only for enums the workspace actually declares', async () => {
    // Usage files import the application's enum, not org.togglz, so the enum set
    // is what identifies them — matching `.isActive()` alone missed every wrapper.
    const text = `${TOGGLZ}class A { void m() { if (Flags.NEW_CHECKOUT.isActive()) {} } }`;
    const enums = indexTogglzEnums([
      { name: 'Flags', qualifiedName: 'Flags', constants: new Set(['NEW_CHECKOUT']) },
    ]);

    const found = await scanSource({ path: 'A.java', text }, { togglzEnums: enums });
    expect(found.map((r) => r.key)).toEqual(['NEW_CHECKOUT']);

    // Without that knowledge the same text yields nothing, rather than guessing.
    expect(await keys('A.java', text)).toEqual([]);
  });

  it('finds a constant passed to a wrapper, not just .isActive()', async () => {
    const text = `${TOGGLZ}class A { void m() { getTogglzFlagDetails(Flags.CARE_SUMMARY); } }`;
    const enums = indexTogglzEnums([
      { name: 'Flags', qualifiedName: 'Flags', constants: new Set(['CARE_SUMMARY']) },
    ]);
    const found = await scanSource({ path: 'A.java', text }, { togglzEnums: enums });
    expect(found.map((r) => r.key)).toEqual(['CARE_SUMMARY']);
  });

  it('marks an enum constant declaration as a declaration, not a usage', async () => {
    // Counting declarations as usage made every declared flag look referenced.
    const text = `${TOGGLZ}public enum Flags implements Feature { ONE; }`;
    const enums = indexTogglzEnums([
      { name: 'Flags', qualifiedName: 'Flags', constants: new Set(['ONE']) },
    ]);
    const found = await scanSource({ path: 'Flags.java', text }, { togglzEnums: enums });
    expect(found.map((r) => r.kind)).toEqual(['declaration']);
  });

  it('does not treat isActive as Togglz without the import', async () => {
    const text = 'class A { void m() { if (session.NEW_CHECKOUT.isActive()) {} } }';
    expect(await keys('A.java', text)).toEqual([]);
  });

  it('resolves constants rather than reporting them as computed', async () => {
    // An enum constant is a literal key; reporting it unresolved would be wrong.
    const text = `${TOGGLZ}public enum Flags implements Feature { ONE; }`;
    const enums = indexTogglzEnums([
      { name: 'Flags', qualifiedName: 'Flags', constants: new Set(['ONE']) },
    ]);
    const refs = await scanSource({ path: 'Flags.java', text }, { togglzEnums: enums });
    expect(refs[0]?.resolution).toBe('resolved');
  });

  it('reports nothing for an enum discovery never verified', async () => {
    // The reported defect: an unrelated `implements Feature` became feature flags.
    const text = 'interface Feature {}\nenum ShippingOptions implements Feature { EXPRESS; }';
    expect(await scanSource({ path: 'ShippingOptions.java', text })).toEqual([]);
  });
});

describe('spring matchIfMissing', () => {
  it('records that the call site supplies its own default', async () => {
    const text = `${SPRING_KT}@ConditionalOnProperty(name = ["q.enabled"], matchIfMissing = true)\nclass A`;
    const refs = await scanSource({ path: 'A.kt', text });
    expect(refs[0]?.defaultsWhenAbsent).toBe(true);
  });

  it('leaves it unset when the annotation does not say so', async () => {
    const text = `${SPRING_KT}@ConditionalOnProperty(name = ["q.enabled"])\nclass A`;
    const refs = await scanSource({ path: 'A.kt', text });
    expect(refs[0]?.defaultsWhenAbsent).toBeUndefined();
  });
});

describe('unsupported flag platforms are disclosed', () => {
  it('recognizes a platform this build cannot analyze', () => {
    const sightings = unsupportedProvidersIn('import io.split.client.SplitClient;');
    expect(sightings.map((s) => s.name)).toEqual(['Split']);
    expect(sightings[0]?.evidence).toContain('io.split');
  });

  it.each([
    ['import com.configcat.ConfigCatClient;', 'ConfigCat'],
    ["import { Flagsmith } from 'flagsmith';", 'Flagsmith'],
    ["import { GrowthBook } from '@growthbook/growthbook';", 'GrowthBook'],
    ['import org.ff4j.FF4j;', 'FF4j'],
  ])('recognizes %s', (text, expected) => {
    expect(unsupportedProvidersIn(text).map((s) => s.name)).toContain(expected);
  });

  it('says nothing for a supported provider', () => {
    // Togglz became supported, so it must not also be announced as a gap.
    expect(unsupportedProvidersIn('import org.togglz.core.Feature;')).toEqual([]);
    expect(unsupportedProvidersIn('import com.launchdarkly.sdk.server.LDClient;')).toEqual([]);
  });

  it('is not fooled by a mention in a comment', () => {
    expect(unsupportedProvidersIn('// we evaluated io.split once\n')).toEqual([]);
  });
});

describe('same-file constants are read, not guessed', () => {
  it('resolves a Java constant holding the key', async () => {
    // The most common real shape, and it was reported as computed until a
    // public corpus showed 170 of 177 references were exactly this.
    const text = [
      'import com.launchdarkly.sdk.server.LDClient;',
      'class A {',
      '  private static final String FLAG = "checkout-v2";',
      '  private LDClient client;',
      '  void m() { client.boolVariation(FLAG, u, false); }',
      '}',
    ].join('\n');
    expect(await keys('A.java', text)).toEqual(['checkout-v2']);
  });

  it('resolves a TypeScript constant', async () => {
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "const client = init('');",
      "const FLAG_KEY = 'dark-mode';",
      'client.variation(FLAG_KEY, u, false);',
    ].join('\n');
    expect(await keys('a.ts', text)).toEqual(['dark-mode']);
  });

  it('resolves a Kotlin constant', async () => {
    const text = [
      'import io.getunleash.Unleash',
      'const val FLAG = "search-v3"',
      'class A(private val unleash: Unleash) { fun f() { unleash.isEnabled(FLAG) } }',
    ].join('\n');
    expect(await keys('A.kt', text)).toEqual(['search-v3']);
  });

  it('folds a constant joined with a literal', async () => {
    const text = [
      'import com.launchdarkly.sdk.server.LDClient;',
      'class A {',
      '  private static final String FLAG = "rollout";',
      '  private LDClient client;',
      '  void m() { client.boolVariation(FLAG + "-2", u, false); }',
      '}',
    ].join('\n');
    expect(await keys('A.java', text)).toEqual(['rollout-2']);
  });

  it('still refuses when any part of the expression is unknown', async () => {
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "const client = init('');",
      "const PREFIX = 'experiment-';",
      'client.variation(PREFIX + name, u, false);',
    ].join('\n');
    const refs = await scanSource({ path: 'a.ts', text });
    expect(refs[0]?.key, 'name is a variable, so the whole key is unknown').toBeNull();
  });

  it('refuses a constant declared in another file', async () => {
    // Cross-file resolution is not attempted, so this stays honestly unresolved.
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "import { EXTERNAL_FLAG } from './flags';",
      "const client = init('');",
      'client.variation(EXTERNAL_FLAG, u, false);',
    ].join('\n');
    expect((await scanSource({ path: 'a.ts', text }))[0]?.key).toBeNull();
  });

  it('refuses a name declared twice with conflicting values', async () => {
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "const client = init('');",
      "const FLAG = 'one';",
      "function other() { const FLAG = 'two'; }",
      'client.variation(FLAG, u, false);',
    ].join('\n');
    expect((await scanSource({ path: 'a.ts', text }))[0]?.key).toBeNull();
  });

  it('does not fold a non-string operator', async () => {
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "const client = init('');",
      'client.variation(a - b, u, false);',
    ].join('\n');
    expect((await scanSource({ path: 'a.ts', text }))[0]?.key).toBeNull();
  });
});

describe('togglz enum discovery', () => {
  const TOGGLZ_IMPORT = 'import org.togglz.core.Feature;\n';

  it('finds a Java feature enum and its constants', async () => {
    const text = [
      TOGGLZ_IMPORT,
      'public enum FeatureFlags implements Feature {',
      '    ANALYTICS_TAB,',
      '    CARE_SUMMARY;',
      '}',
    ].join('\n');
    const [found] = await findTogglzEnums('FeatureFlags.java', text, false);
    expect(found?.name).toBe('FeatureFlags');
    expect([...(found?.constants ?? [])].sort()).toEqual(['ANALYTICS_TAB', 'CARE_SUMMARY']);
  });

  it('handles constants that take constructor arguments', async () => {
    // `A("x", true), B("y", false)` broke a comma-splitting implementation and
    // silently erased the entire Togglz inventory for the repository.
    const text = [
      TOGGLZ_IMPORT,
      'enum Flags implements Feature {',
      '    A("x", true),',
      '    B("y", false);',
      '}',
    ].join('\n');
    const [found] = await findTogglzEnums('Flags.java', text, false);
    expect([...(found?.constants ?? [])].sort()).toEqual(['A', 'B']);
  });

  it('finds a Kotlin feature enum', async () => {
    const text =
      'import org.togglz.core.Feature\nenum class Flags : Feature {\n  ALPHA,\n  BETA\n}';
    const [found] = await findTogglzEnums('Flags.kt', text, false);
    expect([...(found?.constants ?? [])].sort()).toEqual(['ALPHA', 'BETA']);
  });

  it('ignores an unrelated interface that merely shares the name Feature', async () => {
    // Domain code defines `Feature` all the time. Without import evidence a
    // shipping-options enum became a set of feature flags.
    const text = [
      'interface Feature {}',
      'enum ShippingOptions implements Feature {',
      '    EXPRESS,',
      '    STANDARD',
      '}',
    ].join('\n');
    expect(await findTogglzEnums('ShippingOptions.java', text, false)).toEqual([]);
  });

  it('rejects a different qualified Feature even when Togglz is imported', async () => {
    // A qualified name says exactly which Feature it means. Importing Togglz
    // elsewhere in the file does not make com.other.Feature into Togglz's.
    const text = [TOGGLZ_IMPORT, 'enum Mixed implements com.other.Feature { EXPRESS; }'].join('\n');
    expect(await findTogglzEnums('Mixed.java', text, false)).toEqual([]);
  });

  it('accepts a fully qualified Togglz Feature without an import', async () => {
    const text = 'enum Flags implements org.togglz.core.Feature { A, B; }';
    const [found] = await findTogglzEnums('Flags.java', text, false);
    expect([...(found?.constants ?? [])].sort()).toEqual(['A', 'B']);
  });

  it('ignores an enum that does not implement Feature', async () => {
    const text = `${TOGGLZ_IMPORT}public enum Colour implements Serializable { RED; }`;
    expect(await findTogglzEnums('Colour.java', text, false)).toEqual([]);
  });

  it('ignores an enum declared under test sources', async () => {
    // A feature enum defined for a test is scaffolding, not a shipped flag.
    const text = `${TOGGLZ_IMPORT}public enum TestFlags implements Feature { FEATURE_A; }`;
    expect(await findTogglzEnums('FooTest.java', text, true)).toEqual([]);
    expect(await findTogglzEnums('Foo.java', text, false)).toHaveLength(1);
  });
});

describe('test-path classification', () => {
  it.each([
    'src/test/java/com/example/FooTest.java',
    'src/main/java/FooTests.java',
    'src/a.test.ts',
    '__tests__/a.ts',
    'spec/a.ts',
  ])('treats %s as test code', (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  it.each(['src/main/java/com/example/Service.java', 'src/app.ts'])(
    'treats %s as production code',
    (path) => {
      expect(isTestPath(path)).toBe(false);
    },
  );
});

describe('duplicate references collapse', () => {
  it('counts a reference once even when two patterns match it', async () => {
    // A flag counted twice inflates reference counts, module spread, confidence
    // and the debt score.
    const text = 'import org.togglz.core.Feature;\nclass A { void m() { Flags.ONE.isActive(); } }';
    const enums = indexTogglzEnums([
      { name: 'Flags', qualifiedName: 'Flags', constants: new Set(['ONE']) },
    ]);
    const found = await scanSource({ path: 'A.java', text }, { togglzEnums: enums });
    expect(found).toHaveLength(1);
  });
});

describe('only immutable bindings resolve', () => {
  const LD_TS = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\n";
  const LD_JAVA = 'import com.launchdarkly.sdk.server.LDClient;\n';

  it('refuses a reassigned let, whose runtime value differs', async () => {
    // Resolving this reported 'first' while the runtime saw 'second' — a
    // confidently wrong key, which is worse than no key at all.
    const text = `${LD_TS}let FLAG = 'first';\nFLAG = 'second';\nclient.variation(FLAG, u, false);`;
    expect((await scanSource({ path: 'a.ts', text }))[0]?.key).toBeNull();
  });

  it('refuses a reassigned Java local', async () => {
    const text = `${LD_JAVA}class A { LDClient client; void m() { String FLAG = "first"; FLAG = "second"; client.boolVariation(FLAG, u, false); } }`;
    expect((await scanSource({ path: 'A.java', text }))[0]?.key).toBeNull();
  });

  it('resolves a final field', async () => {
    const text = `${LD_JAVA}class A { LDClient client; static final String FLAG = "real"; void m() { client.boolVariation(FLAG, u, false); } }`;
    expect(await keys('A.java', text)).toEqual(['real']);
  });

  it('resolves an effectively final local — declared once, never written', async () => {
    // Java's own term. Requiring the keyword outright cost real detections in a
    // public repository; requiring that nothing writes to it costs none.
    const text = `${LD_JAVA}class A { LDClient client; void m() { String key = "checkout-v2"; client.boolVariation(key, u, false); } }`;
    expect(await keys('A.java', text)).toEqual(['checkout-v2']);
  });

  it('resolves a const', async () => {
    const text = `${LD_TS}const FLAG = 'real';\nclient.variation(FLAG, u, false);`;
    expect(await keys('a.ts', text)).toEqual(['real']);
  });

  it('resolves a Kotlin val but not a var', async () => {
    const prelude = 'import io.getunleash.Unleash\nval unleash: Unleash = TODO()\n';
    const good = `${prelude}val FLAG = "kept"\nfun f() { unleash.isEnabled(FLAG) }`;
    expect(await keys('A.kt', good)).toEqual(['kept']);

    const bad = `${prelude}var FLAG = "changing"\nfun f() { unleash.isEnabled(FLAG) }`;
    expect((await scanSource({ path: 'A.kt', text: bad }))[0]?.key).toBeNull();
  });
});

describe('comments cannot invent a flag key', () => {
  it('ignores a declaration that only appears in a comment', async () => {
    // Reading source text rather than the parse tree let a commented-out line
    // fabricate a key outright — the one guarantee this product cannot break.
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "import { FLAG } from './flags';",
      "const client = init('');",
      "// const FLAG = 'invented-key'",
      'client.variation(FLAG, u, false);',
    ].join('\n');

    const refs = await scanSource({ path: 'a.ts', text });
    expect(refs[0]?.key, 'an imported constant is unknowable from this file').toBeNull();
  });

  it('ignores a declaration inside a block comment', async () => {
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "import { FLAG } from './flags';",
      "const client = init('');",
      "/* const FLAG = 'also-invented'; */",
      'client.variation(FLAG, u, false);',
    ].join('\n');
    expect((await scanSource({ path: 'a.ts', text }))[0]?.key).toBeNull();
  });

  it('ignores a declaration that is only inside a string', async () => {
    const text = [
      "import { init } from 'launchdarkly-node-server-sdk';",
      "import { FLAG } from './flags';",
      "const client = init('');",
      'const sample = "const FLAG = \'from-a-string\'";',
      'client.variation(FLAG, u, false);',
    ].join('\n');
    expect((await scanSource({ path: 'a.ts', text }))[0]?.key).toBeNull();
  });
});

describe('togglz import scope', () => {
  it('is not qualified by importing some other Togglz class', async () => {
    // FeatureManager says nothing about what a bare `Feature` here refers to.
    const text = [
      'import org.togglz.core.manager.FeatureManager;',
      'import com.example.Feature;',
      'enum ShippingOptions implements Feature { EXPRESS, STANDARD }',
    ].join('\n');
    expect(await findTogglzEnums('ShippingOptions.java', text, false)).toEqual([]);
  });

  it('is qualified by importing Feature itself', async () => {
    const text = 'import org.togglz.core.Feature;\nenum F implements Feature { A; }';
    expect(await findTogglzEnums('F.java', text, false)).toHaveLength(1);
  });

  it('is qualified by a package wildcard, which really does bring it into scope', async () => {
    const text = 'import org.togglz.core.*;\nenum F implements Feature { A; }';
    expect(await findTogglzEnums('F.java', text, false)).toHaveLength(1);
  });
});

describe('togglz enums across modules', () => {
  const billing = {
    name: 'FeatureFlags',
    qualifiedName: 'com.example.billing.FeatureFlags',
    constants: new Set(['BILLING_V2']),
  };
  const search = {
    name: 'FeatureFlags',
    qualifiedName: 'com.example.search.FeatureFlags',
    constants: new Set(['RANKING_V3']),
  };
  const enums = indexTogglzEnums([billing, search]);

  it('keeps two same-named enums apart instead of merging them', () => {
    // Merging produced a *wrong* inventory rather than an incomplete one: a
    // reference to one module's FeatureFlags matched the other's constants.
    expect(enums.byQualifiedName.size).toBe(2);
    expect(enums.bySimpleName.get('FeatureFlags')).toHaveLength(2);
  });

  it('resolves through an explicit import', () => {
    const resolved = resolveTogglzEnum(enums, 'FeatureFlags', 'com.example.app', [
      'com.example.billing.FeatureFlags',
    ]);
    expect([...(resolved ?? [])]).toEqual(['BILLING_V2']);
    expect(resolved?.has('RANKING_V3'), 'the other module must not leak in').toBe(false);
  });

  it("resolves through the file's own package when nothing is imported", () => {
    const resolved = resolveTogglzEnum(enums, 'FeatureFlags', 'com.example.search', []);
    expect([...(resolved ?? [])]).toEqual(['RANKING_V3']);
  });

  it('resolves through a wildcard import', () => {
    const resolved = resolveTogglzEnum(enums, 'FeatureFlags', 'com.example.app', [
      'com.example.billing.*',
    ]);
    expect([...(resolved ?? [])]).toEqual(['BILLING_V2']);
  });

  it('gives up when several enums share the name and nothing disambiguates', () => {
    // An unknown flag is dropped rather than guessed at.
    expect(resolveTogglzEnum(enums, 'FeatureFlags', 'com.example.other', [])).toBeUndefined();
  });

  it('resolves a lone enum even without import evidence', () => {
    const only = indexTogglzEnums([billing]);
    expect([...(resolveTogglzEnum(only, 'FeatureFlags', 'anywhere', []) ?? [])]).toEqual([
      'BILLING_V2',
    ]);
  });

  it('reads the declaring package from the file', () => {
    expect(packageOf('package com.example.billing;\nenum X {}')).toBe('com.example.billing');
    expect(packageOf('package com.example.search\n')).toBe('com.example.search');
    expect(packageOf('class NoPackage {}')).toBe('');
  });
});

describe('togglz NamedFeature', () => {
  it('resolves a literal key with no enum involved', async () => {
    // Togglz's escape hatch for custom feature managers and dynamic registration.
    const text = [
      'import org.togglz.core.NamedFeature;',
      'class A { void m() { manager.isActive(new NamedFeature("dynamic-flag")); } }',
    ].join('\n');
    const found = await scanSource({ path: 'A.java', text }, { togglzEnums: indexTogglzEnums([]) });
    expect(found.map((r) => r.key)).toEqual(['dynamic-flag']);
  });

  it('works in Kotlin too', async () => {
    const text = [
      'import org.togglz.core.NamedFeature',
      'fun f() { manager.isActive(NamedFeature("kt-dynamic")) }',
    ].join('\n');
    const found = await scanSource({ path: 'A.kt', text }, { togglzEnums: indexTogglzEnums([]) });
    expect(found.map((r) => r.key)).toEqual(['kt-dynamic']);
  });

  it('needs the Togglz import, like everything else', async () => {
    const text = 'class A { void m() { x.isActive(new NamedFeature("nope")); } }';
    expect(await scanSource({ path: 'A.java', text })).toEqual([]);
  });

  it('leaves a computed NamedFeature argument unresolved', async () => {
    const text = [
      'import org.togglz.core.NamedFeature;',
      'class A { void m(String n) { manager.isActive(new NamedFeature(n)); } }',
    ].join('\n');
    const found = await scanSource({ path: 'A.java', text }, { togglzEnums: indexTogglzEnums([]) });
    expect(found.map((r) => r.key)).toEqual([]);
  });
});
