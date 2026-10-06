import type { Provider } from '../api/generated/scan-report.js';

/**
 * Establishing that a call really belongs to a flag SDK.
 *
 * Matching on method name alone was the original design and it does not survive
 * contact with real code. `isEnabled` is a Lombok builder setter, a domain
 * predicate, and a hundred other ordinary things; `getStringValue` is a helper on
 * somebody's intake form. Reporting those as feature flags is worse than missing
 * a flag, because it teaches a team that the tool does not know what it is
 * looking at.
 *
 * So a provider's methods are only searched for in files that actually import
 * that provider. Real SDK usage requires the import; ordinary application code
 * does not have it. This trades a little recall for the thing the product
 * actually sells, which is being right.
 *
 * Known limit: a file that receives an already-constructed client without
 * importing its type is missed. That is a deliberate, documented miss rather
 * than a confident wrong answer.
 */
const MARKERS: Readonly<Record<string, readonly string[]>> = {
  launchdarkly: [
    'com.launchdarkly',
    'launchdarkly-node-server-sdk',
    'launchdarkly-js-client-sdk',
    'launchdarkly-react-client-sdk',
    '@launchdarkly/',
    'launchdarkly',
  ],
  openfeature: ['dev.openfeature', '@openfeature/', 'openfeature'],
  unleash: ['io.getunleash', 'unleash-client', '@unleash/', 'unleash'],
  togglz: ['org.togglz', 'togglz'],
};

/**
 * Module paths this file imports.
 *
 * Only import and require statements are read — not the whole file — so a
 * provider named in a comment or a string constant does not unlock its methods.
 */
export function importedModules(text: string): string[] {
  const modules: string[] = [];

  // JVM: `import com.launchdarkly.sdk.server.LDClient` / Kotlin `import io.getunleash.Unleash`
  // The trailing `.*` matters: a wildcard import is what brings a bare type name
  // into scope, so it must survive into the module list.
  for (const match of text.matchAll(/^\s*import\s+(?:static\s+)?(\w+(?:\.\w+)*(?:\.\*)?)/gm)) {
    if (match[1] !== undefined) modules.push(match[1]);
  }

  // ES modules and CommonJS: the quoted specifier of an import or require.
  for (const match of text.matchAll(
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g,
  )) {
    if (match[1] !== undefined) modules.push(match[1]);
  }

  // Bare side-effect import: `import 'unleash-client';`
  for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    if (match[1] !== undefined) modules.push(match[1]);
  }

  return modules;
}

/** Providers this file demonstrably imports. */
export function providersInScope(text: string): ReadonlySet<Provider> {
  const modules = importedModules(text).map((m) => m.toLowerCase());
  const found = new Set<Provider>();

  for (const [provider, markers] of Object.entries(MARKERS)) {
    if (modules.some((module) => markers.some((marker) => module.includes(marker)))) {
      found.add(provider as Provider);
    }
  }
  return found;
}

/**
 * Type and factory names that bind an identifier to a provider.
 *
 * An import proves the SDK is used *somewhere in the file*. It does not prove
 * that a given call belongs to it — a file can import Unleash and also build a
 * Lombok object whose setter is called `isEnabled`. So the receiver must also be
 * an identifier this file binds to that provider.
 */
const BINDINGS: Readonly<
  Record<string, { types: readonly string[]; factories: readonly string[] }>
> = {
  launchdarkly: {
    types: ['LDClient', 'LDClientInterface', 'LDClientImpl'],
    factories: ['init', 'initialize', 'LDClient'],
  },
  openfeature: {
    types: ['Client', 'FeatureClient', 'OpenFeatureClient'],
    factories: ['getClient'],
  },
  unleash: {
    types: ['Unleash', 'DefaultUnleash', 'UnleashClient'],
    factories: ['DefaultUnleash', 'startUnleash', 'initialize', 'UnleashClient'],
  },
  togglz: { types: ['FeatureManager'], factories: ['getFeatureManager'] },
};

/**
 * Identifiers this file binds to `provider`.
 *
 * Three declaration shapes cover the languages in scope:
 *   Java     `private final LDClient client;`  / `Unleash unleash` parameters
 *   Kotlin   `private val unleash: Unleash`
 *   TS/JS    `const client = init(...)` / `const client: LDClient = ...`
 */
export function boundIdentifiers(text: string, provider: string): ReadonlySet<string> {
  const binding = BINDINGS[provider];
  const names = new Set<string>();
  if (binding === undefined) return names;

  const types = binding.types.join('|');
  const factories = binding.factories.join('|');

  // `LDClient client` — a Java field, parameter, or local declaration.
  for (const m of text.matchAll(new RegExp(`\\b(?:${types})\\b(?:<[^>]*>)?\\s+(\\w+)`, 'g'))) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  // `unleash: Unleash` — a Kotlin or TypeScript type annotation.
  for (const m of text.matchAll(new RegExp(`(\\w+)\\s*:\\s*(?:${types})\\b`, 'g'))) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  // `const client = new Unleash(...)` / `LDClient c = new LDClient(...)` — a
  // constructor is the most common binding of all, and missing it made every
  // direct instantiation invisible.
  for (const m of text.matchAll(new RegExp(`(\\w+)\\s*=\\s*new\\s+(?:${types})\\s*[(<]`, 'g'))) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  // `const client = init(...)` — assignment from a known factory.
  for (const m of text.matchAll(
    new RegExp(`(\\w+)\\s*=\\s*(?:await\\s+)?(?:[\\w.]*\\.)?(?:${factories})\\s*\\(`, 'g'),
  )) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  return names;
}

/**
 * Flag platforms this build recognizes but cannot analyze.
 *
 * Reporting one flag for a repository that runs nine behind an unsupported
 * platform is as misleading as a false positive — the number looks authoritative
 * and is simply wrong. When one of these is imported, the report says so.
 */
/**
 * Providers that are import-gated but have no client receiver to bind, because
 * their flags are referenced as constants rather than through a client object.
 */
export const RECEIVERLESS_PROVIDERS: ReadonlySet<Provider> = new Set<Provider>(['togglz']);

const UNSUPPORTED: Readonly<Record<string, readonly string[]>> = {
  Split: ['io.split', '@splitsoftware/', 'splitio'],
  ConfigCat: ['com.configcat', 'configcat-'],
  Flagsmith: ['com.flagsmith', 'flagsmith'],
  GrowthBook: ['growthbook', '@growthbook/'],
  Statsig: ['com.statsig', 'statsig'],
  PostHog: ['posthog'],
  Optimizely: ['com.optimizely', '@optimizely/'],
  Flipt: ['go.flipt', 'flipt'],
  FF4j: ['org.ff4j'],
  FeatureHub: ['io.featurehub'],
};

export interface UnsupportedSighting {
  readonly name: string;
  readonly evidence: string;
}

/** Unsupported flag platforms this file imports. */
export function unsupportedProvidersIn(text: string): UnsupportedSighting[] {
  const modules = importedModules(text).map((m) => m.toLowerCase());
  const found: UnsupportedSighting[] = [];

  for (const [name, markers] of Object.entries(UNSUPPORTED)) {
    const hit = modules.find((module) => markers.some((marker) => module.includes(marker)));
    if (hit !== undefined) found.push({ name, evidence: `imports ${hit}` });
  }
  return found;
}

/**
 * Every substring whose absence proves a file has no flag reference in it.
 *
 * This is the prefilter that keeps a large repository scannable. Parsing is
 * essentially the whole cost of a scan — 55% of a Spring Boot scan is inside two
 * tree-sitter WebAssembly functions — and the overwhelming majority of files in a
 * real application mention no flag mechanism at all. Reading a file's text and
 * finding none of these is enormously cheaper than building its syntax tree.
 *
 * The rule that makes it sound: detection already requires either an import of a
 * provider (see `providersInScope`) or a specific annotation. A file containing
 * none of these strings anywhere in its text — comments and string literals
 * included, because a substring search is deliberately blunter than the real
 * check — cannot satisfy either.
 *
 * **Anything added to `MARKERS`, `UNSUPPORTED`, or an ungated adapter's query
 * must appear here, or files carrying it are silently skipped.** That failure is
 * invisible: the scan succeeds and reports fewer flags. `test/core/prefilter.test.ts`
 * asserts every marker table feeds this list, and the corpus regression catches
 * what slips past.
 */
const ALWAYS_PARSE_MARKERS: readonly string[] = [
  ...Object.values(MARKERS).flat(),
  ...Object.values(UNSUPPORTED).flat(),
  // `spring-conditional` is ungated: it needs no import, only the annotation.
  'ConditionalOnProperty',
];

/**
 * Whether a file could possibly contain a flag reference.
 *
 * `extra` carries triggers that are not statically known: user-configured custom
 * method names, and the simple names of Togglz enums discovered elsewhere in the
 * workspace — a file using `Features.CHECKOUT` imports the application's own enum,
 * not `org.togglz`, so nothing in the static tables would match it.
 */
export function mightContainFlags(text: string, extra: readonly string[] = []): boolean {
  for (const marker of ALWAYS_PARSE_MARKERS) {
    if (text.includes(marker)) return true;
  }
  for (const marker of extra) {
    if (marker !== '' && text.includes(marker)) return true;
  }
  return false;
}

/** Exposed so a test can prove every marker table reaches the prefilter. */
export const PREFILTER_MARKERS: readonly string[] = ALWAYS_PARSE_MARKERS;
export const PROVIDER_MARKERS = MARKERS;
export const UNSUPPORTED_MARKERS = UNSUPPORTED;

/**
 * Providers whose detection does not depend on an import.
 *
 * `spring-conditional` is matched by an annotation name specific enough that a
 * false positive is implausible. `custom` methods are named by the user in
 * `.flagmarshal.yml`, so gating them on an import would defeat their purpose —
 * the team is asserting these are their flag helpers.
 */
export const UNGATED_PROVIDERS: ReadonlySet<Provider> = new Set<Provider>([
  'spring-conditional',
  'custom',
  'properties',
  'environment',
]);
