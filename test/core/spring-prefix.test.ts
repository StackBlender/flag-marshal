import { describe, expect, it } from 'vitest';
import { scanSource } from '../../src/core/api/index.js';

/**
 * Spring reads `prefix + "." + name`. Reading the name alone put a key in the
 * inventory that no configuration defines, so every prefixed switch looked
 * unconfigured.
 */
const JAVA = 'import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;\n';
const KT = 'import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty\n';

const refs = async (path: string, text: string) =>
  (await scanSource({ path, text })).map((r) => [r.key, r.expression]);

describe('Spring prefix composition', () => {
  it('joins prefix and name with a dot in Java', async () => {
    const text = `${JAVA}@ConditionalOnProperty(prefix = "features", name = "checkout", havingValue = "true")\nclass A {}`;
    expect(await refs('A.java', text)).toEqual([['features.checkout', undefined]]);
  });

  it('does not double a dot the prefix already ends with', async () => {
    const text = `${JAVA}@ConditionalOnProperty(prefix = "features.", name = "checkout")\nclass A {}`;
    expect(await refs('A.java', text)).toEqual([['features.checkout', undefined]]);
  });

  it('applies the prefix to every name in an array', async () => {
    const text = `${JAVA}@ConditionalOnProperty(prefix = "jobs", name = {"a.enabled", "b.enabled"})\nclass A {}`;
    expect(await refs('A.java', text)).toEqual([
      ['jobs.a.enabled', undefined],
      ['jobs.b.enabled', undefined],
    ]);
  });

  it('works in Kotlin, including named arguments in any order', async () => {
    const text = `${KT}@ConditionalOnProperty(name = ["checkout"], prefix = "features")\nclass A`;
    expect(await refs('A.kt', text)).toEqual([['features.checkout', undefined]]);
  });

  it('resolves a prefix held in a constant', async () => {
    const text = `${JAVA}class A {\n  static final String P = "features";\n  @ConditionalOnProperty(prefix = P, name = "checkout")\n  void f() {}\n}`;
    expect(await refs('A.java', text)).toEqual([['features.checkout', undefined]]);
  });

  it('leaves the whole key unresolved when the prefix cannot be read', async () => {
    const text = `${JAVA}@ConditionalOnProperty(prefix = Config.PREFIX, name = "checkout")\nclass A {}`;
    expect(await refs('A.java', text)).toEqual([[null, 'Config.PREFIX + "checkout"']]);
  });

  it('is unchanged without a prefix, or with an empty one', async () => {
    const none = `${JAVA}@ConditionalOnProperty(name = "checkout.enabled")\nclass A {}`;
    const empty = `${JAVA}@ConditionalOnProperty(prefix = "", name = "checkout.enabled")\nclass A {}`;
    expect(await refs('A.java', none)).toEqual([['checkout.enabled', undefined]]);
    expect(await refs('A.java', empty)).toEqual([['checkout.enabled', undefined]]);
  });

  it('never reads a prefix from another annotation', async () => {
    const text = `${JAVA}@ConfigurationProperties(prefix = "other")\n@ConditionalOnProperty(name = "checkout.enabled")\nclass A {}`;
    expect(await refs('A.java', text)).toEqual([['checkout.enabled', undefined]]);
  });
});
