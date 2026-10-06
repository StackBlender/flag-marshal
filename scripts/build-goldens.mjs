/**
 * Builds the golden ScanReport for each fixture.
 *
 * The expectations below are hand-declared: they are the specification of what
 * the analyzer must produce, written before the analyzer exists. Only the
 * line/column arithmetic is computed, so the goldens are exact rather than
 * guessed.
 *
 * Convention: a reference range covers the flag-key string literal *including*
 * its quotes. For an unresolved reference the range covers the expression that
 * could not be resolved.
 *
 * `root` is stored as the fixture name, not an absolute path, so goldens are
 * machine-independent. A consumer comparing real output normalizes `root` the
 * same way.
 *
 * Findings are declared per fixture below and describe the **finished** target,
 * not today's behavior. `java-spring-conditional` expects only one
 * `flag.absent-from-code`, because once Java is parsed in Milestone 6 the other
 * two properties will have code references. `flag.stale` findings arrive with
 * Milestone 5.
 *
 * `flag.unresolved-key` findings are derived, not declared: one per unresolved
 * reference, anchored at the same range.
 *
 * Usage: node scripts/build-goldens.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(root, 'fixtures');

// Read rather than hardcode: a golden pinning a stale version drifts on every
// release and fails for a reason that has nothing to do with detection.
const { version } = createRequire(import.meta.url)('../package.json');

/** @typedef {{file:string, match:string, occurrence?:number, key:string|null, provider:string, language:string, kind:string, resolution:string, expression?:string}} Expect */

/** @type {Record<string, {references: Expect[], inConfiguration: Record<string, boolean>}>} */
const EXPECTATIONS = {
  'ts-launchdarkly': {
    references: [
      {
        file: 'src/checkout.ts',
        match: "'checkout-v2'",
        key: 'checkout-v2',
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/checkout.ts',
        match: "'express-shipping'",
        key: 'express-shipping',
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/pricing.ts',
        match: "'checkout-v2'",
        key: 'checkout-v2',
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'resolved',
      },
    ],
    inConfiguration: { 'checkout-v2': false, 'express-shipping': false },
  },
  'java-spring-conditional': {
    references: [
      {
        file: 'src/main/java/com/example/ReportingConfig.java',
        match: '"features.nightly-reports"',
        key: 'features.nightly-reports',
        provider: 'spring-conditional',
        language: 'java',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/main/java/com/example/ReportingConfig.java',
        match: '"features.legacy-export"',
        key: 'features.legacy-export',
        provider: 'spring-conditional',
        language: 'java',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application.properties',
        match: 'features.nightly-reports',
        occurrence: 0,
        key: 'features.nightly-reports',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application.properties',
        match: 'features.legacy-export',
        occurrence: 0,
        key: 'features.legacy-export',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application.properties',
        match: 'features.retired-dashboard',
        occurrence: 0,
        key: 'features.retired-dashboard',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
    ],
    inConfiguration: {
      'features.nightly-reports': true,
      'features.legacy-export': true,
      'features.retired-dashboard': true,
    },
    // Once Java is parsed, only retired-dashboard is genuinely unreferenced, and
    // no unparsed language remains to cap the claim.
    findings: [
      {
        id: 'flag.absent-from-code',
        flagKey: 'features.retired-dashboard',
        severity: 'warning',
        confidence: 'medium',
        evidence: [
          { kind: 'absent-from-code', detail: true },
          { kind: 'reference-count', detail: 0 },
        ],
      },
    ],
  },
  'kotlin-unleash': {
    references: [
      {
        file: 'src/Search.kt',
        match: '"search-ranking-v3"',
        key: 'search-ranking-v3',
        provider: 'unleash',
        language: 'kotlin',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/Search.kt',
        match: '"typeahead"',
        key: 'typeahead',
        provider: 'unleash',
        language: 'kotlin',
        kind: 'production-code',
        resolution: 'resolved',
      },
    ],
    inConfiguration: { 'search-ranking-v3': false, typeahead: false },
  },
  'mixed-polyglot': {
    references: [
      {
        file: 'service/src/main/java/com/example/BillingService.java',
        match: '"unified-billing"',
        key: 'unified-billing',
        provider: 'launchdarkly',
        language: 'java',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'web/src/banner.ts',
        match: "'unified-billing'",
        key: 'unified-billing',
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'resolved',
      },
    ],
    inConfiguration: { 'unified-billing': false },
  },
  'no-flags': { references: [], inConfiguration: {}, findings: [] },
  'java-togglz': {
    references: [
      {
        file: 'src/main/java/com/example/Checkout.java',
        // The engine anchors at the constant, not at the enum type before it.
        match: 'NEW_CHECKOUT',
        span: 'NEW_CHECKOUT',
        key: 'NEW_CHECKOUT',
        provider: 'togglz',
        language: 'java',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/main/java/com/example/FeatureFlags.java',
        match: 'NEW_CHECKOUT("checkout", true)',
        span: 'NEW_CHECKOUT',
        key: 'NEW_CHECKOUT',
        provider: 'togglz',
        language: 'java',
        kind: 'declaration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/java/com/example/FeatureFlags.java',
        match: 'LEGACY_EXPORT("export", false)',
        span: 'LEGACY_EXPORT',
        key: 'LEGACY_EXPORT',
        provider: 'togglz',
        language: 'java',
        kind: 'declaration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/java/com/example/FeatureFlags.java',
        match: 'RETIRED_BANNER("banner", false)',
        span: 'RETIRED_BANNER',
        key: 'RETIRED_BANNER',
        provider: 'togglz',
        language: 'java',
        kind: 'declaration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application.yaml',
        match: 'NEW_CHECKOUT',
        span: 'NEW_CHECKOUT',
        key: 'NEW_CHECKOUT',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application.yaml',
        match: 'LEGACY_EXPORT',
        span: 'LEGACY_EXPORT',
        key: 'LEGACY_EXPORT',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application.yaml',
        match: 'RETIRED_BANNER',
        span: 'RETIRED_BANNER',
        key: 'RETIRED_BANNER',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
    ],
    inConfiguration: { NEW_CHECKOUT: true, LEGACY_EXPORT: true, RETIRED_BANNER: true },
    findings: [],
  },
  'real-world-shapes': {
    references: [
      {
        file: 'src/main/java/com/example/RealFlags.java',
        match: '"checkout-v2"',
        key: 'checkout-v2',
        provider: 'launchdarkly',
        language: 'java',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/main/kotlin/com/example/Conditionals.kt',
        match: '"acmeco.allow-override-user-expiration"',
        key: 'acmeco.allow-override-user-expiration',
        provider: 'spring-conditional',
        language: 'kotlin',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/main/kotlin/com/example/Conditionals.kt',
        match: '"scheduledJobs.aiAppointment.enabled"',
        key: 'scheduledJobs.aiAppointment.enabled',
        provider: 'spring-conditional',
        language: 'kotlin',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application-aws_dev.yaml',
        match: 'allow-override-user-expiration',
        key: 'acmeco.allow-override-user-expiration',
        span: 'allow-override-user-expiration',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
      {
        file: 'src/main/resources/application-aws_dev.yaml',
        match: 'enabled: true',
        span: 'enabled',
        key: 'scheduledJobs.aiAppointment.enabled',
        provider: 'properties',
        language: 'properties',
        kind: 'configuration',
        resolution: 'resolved',
      },
    ],
    inConfiguration: {
      'acmeco.allow-override-user-expiration': true,
      'scheduledJobs.aiAppointment.enabled': true,
      'checkout-v2': false,
    },
    findings: [],
  },
  'computed-keys': {
    references: [
      {
        file: 'src/dynamic.ts',
        match: "'audit-log'",
        key: 'audit-log',
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'resolved',
      },
      {
        file: 'src/dynamic.ts',
        match: 'PREFIX + name',
        key: null,
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'unresolved',
        expression: 'PREFIX + name',
      },
      {
        file: 'src/dynamic.ts',
        match: 'client.variation(key,',
        key: null,
        provider: 'launchdarkly',
        language: 'typescript',
        kind: 'production-code',
        resolution: 'unresolved',
        expression: 'key',
      },
    ],
    inConfiguration: { 'audit-log': false },
  },
};

/**
 * Declared findings, anchored to the flag's first reference, plus one derived
 * `flag.unresolved-key` per unresolved reference. Ordering matches the engine:
 * by flag key (null first), then rule id.
 */
function buildFindings(spec, flags, unresolvedRefs) {
  const declared = (spec.findings ?? []).map((finding) => {
    const flag = flags.find((f) => f.key === finding.flagKey);
    const range = flag?.references[0]?.range;
    return range === undefined ? finding : { ...finding, range };
  });

  const derived = unresolvedRefs.map((ref) => ({
    id: 'flag.unresolved-key',
    flagKey: null,
    severity: 'info',
    confidence: 'high',
    evidence: [{ kind: 'reference-count', detail: 1 }],
    range: ref.range,
  }));

  return [...derived, ...declared].sort((a, b) => {
    const ka = a.flagKey ?? '';
    const kb = b.flagKey ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    const ra = a.range;
    const rb = b.range;
    if (!ra || !rb) return 0;
    if (ra.file !== rb.file) return ra.file < rb.file ? -1 : 1;
    if (ra.start.line !== rb.start.line) return ra.start.line - rb.start.line;
    return ra.start.character - rb.start.character;
  });
}

/** Byte-agnostic line/character position. JS string indices are already UTF-16 code units. */
function positionAt(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length - 1;
  const lastNewline = before.lastIndexOf('\n');
  return { line, character: index - lastNewline - 1 };
}

function locate(text, match, occurrence = 0) {
  let index = -1;
  for (let i = 0; i <= occurrence; i++) {
    index = text.indexOf(match, index + 1);
    if (index === -1) throw new Error(`no occurrence ${occurrence} of ${JSON.stringify(match)}`);
  }
  return index;
}

async function buildReport(name) {
  const spec = EXPECTATIONS[name];
  const cache = new Map();
  const refs = [];

  for (const e of spec.references) {
    if (!cache.has(e.file))
      cache.set(e.file, await readFile(resolve(FIXTURES, name, e.file), 'utf8'));
    const text = cache.get(e.file);
    // For an unresolved reference the declared expression is what the range covers.
    const needle = e.resolution === 'unresolved' ? e.expression : e.match;
    const anchor = locate(text, e.match, e.occurrence);
    const start = e.resolution === 'unresolved' ? text.indexOf(needle, anchor) : anchor;
    if (start === -1) throw new Error(`${name}/${e.file}: cannot locate ${JSON.stringify(needle)}`);

    refs.push({
      key: e.key,
      range: {
        file: e.file,
        start: positionAt(text, start),
        // `span` is the text actually present, which differs from the key for a
        // nested YAML entry flattened to a dotted path.
        end: positionAt(text, start + (e.span ?? needle).length),
      },
      provider: e.provider,
      language: e.language,
      kind: e.kind,
      resolution: e.resolution,
      ...(e.expression === undefined ? {} : { expression: e.expression }),
    });
  }

  const byKey = new Map();
  for (const ref of refs) {
    if (ref.key === null) continue;
    if (!byKey.has(ref.key)) byKey.set(ref.key, []);
    byKey.get(ref.key).push(ref);
  }

  const unresolvedRefs = refs.filter((r) => r.resolution === 'unresolved');

  const flags = [...byKey.keys()].sort().map((key) => ({
    key,
    references: byKey.get(key),
    inConfiguration: spec.inConfiguration[key] ?? false,
    evidence: [],
    confidence: 'unknown',
  }));

  return {
    schemaVersion: '1.0',
    tool: { name: 'flag-marshal', coreVersion: version },
    root: name,
    positionEncoding: 'utf-16',
    flags,
    findings: buildFindings(spec, flags, unresolvedRefs),
    // Unresolved references belong to no flag record, so they would otherwise be
    // invisible in the golden. Kept here so the fixture's central guarantee is
    // asserted rather than implied.
    unresolvedReferences: unresolvedRefs,
    // No fixture uses an unsupported platform; the field is required, so it is
    // present and empty rather than absent.
    unsupportedProviders: [],
  };
}

const check = process.argv.includes('--check');
let stale = 0;

for (const name of Object.keys(EXPECTATIONS)) {
  const report = await buildReport(name);
  const path = resolve(FIXTURES, name, 'expected.json');
  const next = JSON.stringify(report, null, 2) + '\n';
  if (check) {
    const current = await readFile(path, 'utf8').catch(() => '');
    if (current !== next) {
      console.error(`stale golden: fixtures/${name}/expected.json`);
      stale++;
    }
  } else {
    await writeFile(path, next, 'utf8');
    console.log(`wrote fixtures/${name}/expected.json`);
  }
}

if (check) {
  if (stale > 0) {
    console.error('Run: npm run build:goldens');
    process.exit(1);
  }
  console.log('Goldens are up to date.');
}
