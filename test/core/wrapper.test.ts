import { describe, expect, it } from 'vitest';
import {
  customAdapter,
  openWorkspace,
  scanSource,
  type DirectoryEntry,
  type FileSystem,
} from '../../src/core/api/index.js';

/**
 * A team's own flag helper holds the one SDK call whose key is never literal.
 * Once the helper is declared under `customPatterns.methods`, its callers are
 * read individually, so the call inside is a pass-through, not a blind spot.
 */
async function scan(path: string, text: string, methods: string[]) {
  const adapter = customAdapter(methods);
  return scanSource(
    { path, text },
    { ...(adapter === undefined ? {} : { adapters: [adapter] }), customMethods: methods },
  );
}

const unresolved = (refs: Awaited<ReturnType<typeof scan>>) =>
  refs.filter((r) => r.resolution === 'unresolved').map((r) => r.expression);

const TS_LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('k');\n";

describe('declared wrapper pass-through', () => {
  it('drops the key parameter inside a declared TypeScript helper', async () => {
    const text = `${TS_LD}export function isOn(key: string) {\n  return client.variation(key, {}, false);\n}\nisOn('checkout-v2');\n`;
    const refs = await scan('src/flags.ts', text, ['isOn']);
    expect(unresolved(refs)).toEqual([]);
    expect(refs.map((r) => [r.key, r.provider])).toEqual([['checkout-v2', 'custom']]);
  });

  it('names an arrow function after the variable holding it', async () => {
    const text = `${TS_LD}export const isOn = (key: string) => client.variation(key, {}, false);\n`;
    expect(unresolved(await scan('src/flags.ts', text, ['isOn']))).toEqual([]);
  });

  it('drops it inside a declared Java method', async () => {
    const text = `import io.getunleash.Unleash;
class Flags {
  private final Unleash unleash;
  boolean isOn(String name) { return unleash.isEnabled(name); }
}`;
    expect(unresolved(await scan('src/main/java/Flags.java', text, ['isOn']))).toEqual([]);
  });

  it('drops it inside a declared Kotlin function', async () => {
    const text = `import io.getunleash.Unleash
class Flags(private val unleash: Unleash) {
  fun isOn(name: String): Boolean = unleash.isEnabled(name)
}`;
    expect(unresolved(await scan('src/main/kotlin/Flags.kt', text, ['isOn']))).toEqual([]);
  });

  it('keeps it unresolved when the helper is not declared', async () => {
    const text = `${TS_LD}export function isOn(key: string) {\n  return client.variation(key, {}, false);\n}\n`;
    expect(unresolved(await scan('src/flags.ts', text, []))).toEqual(['key']);
    expect(unresolved(await scan('src/flags.ts', text, ['somethingElse']))).toEqual(['key']);
  });

  it('keeps it unresolved when the helper rewrites the key', async () => {
    // The caller's literal is no longer the key the SDK evaluates.
    const text = `${TS_LD}export function isOn(key: string) {\n  key = 'team-' + key;\n  return client.variation(key, {}, false);\n}\n`;
    expect(unresolved(await scan('src/flags.ts', text, ['isOn']))).toEqual(['key']);
  });

  it('keeps it unresolved when the key is built from the parameter', async () => {
    const text = `${TS_LD}export function isOn(key: string) {\n  return client.variation('team-' + key, {}, false);\n}\n`;
    expect(unresolved(await scan('src/flags.ts', text, ['isOn']))).toEqual(["'team-' + key"]);
  });

  it('keeps it unresolved when the identifier is a local, not a parameter', async () => {
    const text = `${TS_LD}export function isOn(name: string) {\n  const key = lookup(name);\n  return client.variation(key, {}, false);\n}\n`;
    expect(unresolved(await scan('src/flags.ts', text, ['isOn']))).toEqual(['key']);
  });
});

describe('custom helpers called without a receiver', () => {
  const resolved = (refs: Awaited<ReturnType<typeof scan>>) =>
    refs.filter((r) => r.resolution === 'resolved').map((r) => [r.key, r.provider]);

  it('reads a bare call in each wired language', async () => {
    expect(
      resolved(await scan('a.ts', "import { isOn } from './f';\nisOn('ts-flag');", ['isOn'])),
    ).toEqual([['ts-flag', 'custom']]);
    expect(
      resolved(
        await scan('A.java', 'class A { void f() { if (isOn("java-flag")) {} } }', ['isOn']),
      ),
    ).toEqual([['java-flag', 'custom']]);
    expect(resolved(await scan('A.kt', 'fun f() { if (isOn("kt-flag")) {} }', ['isOn']))).toEqual([
      ['kt-flag', 'custom'],
    ]);
  });

  it('still requires the name to be declared', async () => {
    expect(await scan('a.ts', "isOn('ts-flag');", ['other'])).toEqual([]);
  });

  it('never extends to built-in SDK methods', async () => {
    // A bare `variation(...)` proves nothing about which library it belongs to.
    expect(await scan('a.ts', `${TS_LD}variation('x', {}, false);`, [])).toEqual([]);
  });
});

/** A flat in-memory workspace under `/w`. */
function memoryFs(files: Record<string, string>): FileSystem {
  return {
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const entries = new Map<string, boolean>();
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf('/');
        entries.set(slash === -1 ? rest : rest.slice(0, slash), slash !== -1);
      }
      if (entries.size === 0) throw new Error(`ENOENT: ${path}`);
      return [...entries].map(([name, isDirectory]) => ({
        name,
        isDirectory,
        isFile: !isDirectory,
        isSymbolicLink: false,
      }));
    },
    async readFile(path: string): Promise<string> {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
  };
}

const HELPER = `${TS_LD}export function isOn(key: string) {\n  return client.variation(key, {}, false);\n}\n`;
const CALLERS = "import { isOn } from './flags';\nisOn('checkout-v2');\n";

async function scanWorkspace(files: Record<string, string>) {
  const prefixed = Object.fromEntries(Object.entries(files).map(([k, v]) => [`/w/${k}`, v]));
  return openWorkspace({ root: '/w', fs: memoryFs(prefixed) }).scan();
}

describe('attributing a declared helper to the SDK it wraps', () => {
  it('reads its callers as that SDK, so remote-flag rules apply', async () => {
    const report = await scanWorkspace({
      '.flagmarshal.yml': 'customPatterns:\n  methods: [isOn]\n',
      'src/flags.ts': HELPER,
      'src/checkout.ts': CALLERS,
    });
    expect(report.unresolvedReferences).toEqual([]);
    expect(report.flags.map((f) => [f.key, f.references.map((r) => r.provider)])).toEqual([
      ['checkout-v2', ['launchdarkly']],
    ]);
    // A LaunchDarkly flag is never expected in local configuration.
    expect(report.findings.map((f) => f.id)).not.toContain('flag.missing-in-configuration');
  });

  it('attributes nothing when a declared helper was never seen forwarding', async () => {
    const report = await scanWorkspace({
      '.flagmarshal.yml': 'customPatterns:\n  methods: [isOn, fromConfig]\n',
      'src/flags.ts': HELPER,
      'src/checkout.ts': `${CALLERS}fromConfig('local-switch');\n`,
    });
    expect(new Set(report.flags.flatMap((f) => f.references.map((r) => r.provider)))).toEqual(
      new Set(['custom']),
    );
  });

  it('attributes nothing when helpers wrap different SDKs', async () => {
    const unleash = `import { Unleash } from 'unleash-client';\nconst u = new Unleash({});\nexport function isOnU(name: string) {\n  return u.isEnabled(name);\n}\n`;
    const report = await scanWorkspace({
      '.flagmarshal.yml': 'customPatterns:\n  methods: [isOn, isOnU]\n',
      'src/flags.ts': HELPER,
      'src/u.ts': unleash,
      'src/checkout.ts': CALLERS,
    });
    expect(report.unresolvedReferences).toEqual([]);
    expect(report.flags[0]?.references[0]?.provider).toBe('custom');
  });
});

describe('suggesting an undeclared helper', () => {
  const candidates = async (path: string, text: string) =>
    (await scan(path, text, []))
      .filter((r) => r.resolution === 'unresolved')
      .map((r) => r.helperCandidate);

  it('names the function a key is passed straight through', async () => {
    const ts = `${TS_LD}export function isOn(key: string) {\n  return client.variation(key, {}, false);\n}\n`;
    expect(await candidates('src/flags.ts', ts)).toEqual(['isOn']);
    const arrow = `${TS_LD}export const isOn = (key: string) => client.variation(key, {}, false);\n`;
    expect(await candidates('src/flags.ts', arrow)).toEqual(['isOn']);
    const java = `import io.getunleash.Unleash;
class Flags {
  private final Unleash unleash;
  boolean enabled(String name) { return unleash.isEnabled(name); }
}`;
    expect(await candidates('src/main/java/Flags.java', java)).toEqual(['enabled']);
  });

  it('suggests nothing when the key is built, rewritten, or local', async () => {
    const built = `${TS_LD}export function isOn(key: string) {\n  return client.variation('team-' + key, {}, false);\n}\n`;
    const rewritten = `${TS_LD}export function isOn(key: string) {\n  key = 'team-' + key;\n  return client.variation(key, {}, false);\n}\n`;
    const local = `${TS_LD}export function isOn(name: string) {\n  const key = lookup(name);\n  return client.variation(key, {}, false);\n}\n`;
    for (const text of [built, rewritten, local]) {
      expect(await candidates('src/flags.ts', text)).toEqual([undefined]);
    }
  });

  it('never suggests a name shared with an SDK method', async () => {
    // Declared, `isEnabled` would match every Lombok setter in the repository.
    const text = `import { Unleash } from 'unleash-client';\nconst u = new Unleash({});\nexport function isEnabled(name: string) {\n  return u.isEnabled(name);\n}\n`;
    expect(await candidates('src/flags.ts', text)).toEqual([undefined]);
  });
});
