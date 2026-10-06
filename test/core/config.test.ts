import { describe, expect, it } from 'vitest';
import { configKindFor, parseConfig } from '../../src/core/api/index.js';

/** Keys that stand on their own, i.e. under a recognized flag namespace. */
const keys = (path: string, text: string, kind: 'properties' | 'yaml' | 'env'): string[] =>
  parseConfig(path, text, kind)
    .filter((e) => e.inFlagNamespace)
    .map((e) => e.reference.key ?? '');

/** Every boolean entry, including those needing source evidence to count. */
const candidates = (path: string, text: string, kind: 'properties' | 'yaml' | 'env'): string[] =>
  parseConfig(path, text, kind).map((e) => e.reference.key ?? '');

describe('configuration discovery', () => {
  it.each([
    ['src/main/resources/application.properties', 'properties'],
    ['application-prod.properties', 'properties'],
    ['src/main/resources/application.yml', 'yaml'],
    ['application.yaml', 'yaml'],
    ['.env', 'env'],
    ['.env.production', 'env'],
  ])('recognizes %s', (path, expected) => {
    expect(configKindFor(path)).toBe(expected);
  });

  it.each(['src/index.ts', 'README.md', 'package.json', 'settings.properties'])(
    'ignores %s',
    (path) => {
      expect(configKindFor(path)).toBeUndefined();
    },
  );
});

describe('properties', () => {
  it('takes boolean entries under a flag namespace', () => {
    expect(
      keys('a.properties', 'features.new-checkout=true\nfeatures.old=false\n', 'properties'),
    ).toEqual(['features.new-checkout', 'features.old']);
  });

  it('leaves ordinary configuration alone', () => {
    // The heuristic must not turn every property into a feature flag.
    const text = 'spring.application.name=reporting\nserver.port=8080\nfeatures.x=true\n';
    expect(keys('a.properties', text, 'properties')).toEqual(['features.x']);
  });

  it('rejects a boolean property that is not under a flag namespace', () => {
    // Both signals must agree. Real Spring configuration is full of booleans
    // that are settings, not flags — `spring.jpa.show-sql=true` is the classic.
    // A namespace check that never fires would let every one of them through.
    const text = [
      'spring.jpa.show-sql=true',
      'server.compression.enabled=true',
      'management.endpoints.web.exposure.enabled=false',
      'features.real=true',
    ].join('\n');
    expect(keys('a.properties', text, 'properties')).toEqual(['features.real']);
  });

  it('ignores a flag-namespaced entry whose value is not boolean-like', () => {
    expect(keys('a.properties', 'features.rollout=0.25\n', 'properties')).toEqual([]);
  });

  it('keeps a non-flag-namespaced boolean as a candidate for source evidence', () => {
    // `acmeco.allow-override-user-expiration` is a real Spring flag. Configuration
    // alone cannot tell it apart from an ordinary setting, so it is carried as a
    // candidate and the session promotes it when code actually reads it.
    const text = 'acmeco.allow-override-user-expiration=true\n';
    expect(keys('a.properties', text, 'properties')).toEqual([]);
    expect(candidates('a.properties', text, 'properties')).toEqual([
      'acmeco.allow-override-user-expiration',
    ]);
  });

  it('keeps a nested non-flag namespace as a candidate too', () => {
    const text = 'scheduledJobs:\n  aiAppointment:\n    enabled: true\n';
    expect(keys('application.yml', text, 'yaml')).toEqual([]);
    expect(candidates('application.yml', text, 'yaml')).toEqual([
      'scheduledJobs.aiAppointment.enabled',
    ]);
  });

  it('skips comments and blank lines', () => {
    const text = '# features.commented=true\n\n!features.bang=true\nfeatures.real=true\n';
    expect(keys('a.properties', text, 'properties')).toEqual(['features.real']);
  });

  it('accepts the colon separator the Java format allows', () => {
    expect(keys('a.properties', 'features.colon:true\n', 'properties')).toEqual(['features.colon']);
  });

  it('reports a range covering the key, not the whole line', () => {
    const [entry] = parseConfig('a.properties', '  features.x=true\n', 'properties');
    const ref = entry?.reference;
    expect(ref?.range).toEqual({
      file: 'a.properties',
      start: { line: 0, character: 2 },
      end: { line: 0, character: 12 },
    });
  });
});

describe('yaml', () => {
  it('flattens nested keys to the dotted form properties use', () => {
    // features.nightly must be one flag whether written nested or dotted.
    const text = 'features:\n  nightly: true\n  legacy: false\n';
    expect(keys('application.yml', text, 'yaml')).toEqual(['features.nightly', 'features.legacy']);
  });

  it('leaves ordinary configuration alone', () => {
    const text = 'spring:\n  application:\n    name: reporting\nfeatures:\n  x: true\n';
    expect(keys('application.yml', text, 'yaml')).toEqual(['features.x']);
  });

  it('rejects a boolean setting that is not under a flag namespace', () => {
    const text = 'spring:\n  jpa:\n    show-sql: true\nfeatures:\n  real: true\n';
    expect(keys('application.yml', text, 'yaml')).toEqual(['features.real']);
  });

  it('anchors the range at the key', () => {
    const [entry] = parseConfig('application.yml', 'features:\n  nightly: true\n', 'yaml');
    const ref = entry?.reference;
    expect(ref?.range.start).toEqual({ line: 1, character: 2 });
  });

  it('returns nothing for malformed yaml rather than failing the scan', () => {
    expect(keys('application.yml', 'features:\n  - [unclosed\n', 'yaml')).toEqual([]);
  });
});

describe('env', () => {
  it('takes conventional feature switches', () => {
    const text = 'FEATURE_CHECKOUT=true\nFLAG_BANNER=false\nENABLE_BETA=yes\n';
    expect(keys('.env', text, 'env')).toEqual(['FEATURE_CHECKOUT', 'FLAG_BANNER', 'ENABLE_BETA']);
  });

  it('leaves credentials and ordinary variables alone', () => {
    const text = 'DATABASE_URL=postgres://x\nAPI_KEY=secret\nFEATURE_X=true\n';
    expect(keys('.env', text, 'env')).toEqual(['FEATURE_X']);
  });

  it('rejects a boolean variable that is not a conventional switch', () => {
    const text = 'DEBUG=true\nCI=true\nVERBOSE=false\nFEATURE_X=true\n';
    expect(keys('.env', text, 'env')).toEqual(['FEATURE_X']);
  });

  it('handles export prefixes and quoted values', () => {
    expect(keys('.env', 'export FEATURE_Y="true"\n', 'env')).toEqual(['FEATURE_Y']);
  });

  it('marks env references with the environment provider', () => {
    const [entry] = parseConfig('.env', 'FEATURE_X=true\n', 'env');
    const ref = entry?.reference;
    expect(ref?.provider).toBe('environment');
    expect(ref?.kind).toBe('configuration');
  });
});
