import type { Language, Provider } from '../../api/generated/scan-report.js';
import type { ProviderAdapter } from '../provider.js';
import { bareCallQuery, methodCallQuery, springConditionalQuery, togglzQuery } from '../queries.js';

/**
 * A provider described as data.
 *
 * The `Done when` for Milestone 6 is that adding a provider requires no change to
 * the index, evidence, or scoring layers. A declaration here is the whole change.
 */
interface MethodProvider {
  readonly id: Provider;
  /** SDK methods whose first argument is the flag key. */
  readonly methods: readonly string[];
  /** Languages this SDK is used from. */
  readonly languages: readonly Language[];
}

const JVM_AND_JS: readonly Language[] = ['typescript', 'javascript', 'java', 'kotlin'];

const METHOD_PROVIDERS: readonly MethodProvider[] = [
  {
    id: 'launchdarkly',
    methods: [
      'variation',
      'variationDetail',
      'boolVariation',
      'boolVariationDetail',
      'stringVariation',
      'stringVariationDetail',
      'numberVariation',
      'numberVariationDetail',
      'intVariation',
      'doubleVariation',
      'jsonVariation',
      'jsonVariationDetail',
    ],
    languages: JVM_AND_JS,
  },
  {
    id: 'openfeature',
    methods: [
      'getBooleanValue',
      'getBooleanDetails',
      'getStringValue',
      'getStringDetails',
      'getNumberValue',
      'getNumberDetails',
      'getIntegerValue',
      'getDoubleValue',
      'getObjectValue',
      'getObjectDetails',
    ],
    languages: JVM_AND_JS,
  },
  {
    id: 'unleash',
    methods: ['isEnabled', 'getVariant'],
    languages: JVM_AND_JS,
  },
];

/**
 * Every built-in SDK method name. A custom pattern matches its names on any
 * receiver in any file, so declaring one of these would read every Lombok
 * `isEnabled(...)` or domain `variation(...)` as a flag — undoing the import
 * gate. Nothing may suggest declaring them.
 */
export const BUILT_IN_METHOD_NAMES: ReadonlySet<string> = new Set(
  METHOD_PROVIDERS.flatMap((provider) => provider.methods),
);

function methodAdapter(provider: MethodProvider): ProviderAdapter {
  return {
    id: provider.id,
    queryFor(_language, languageId) {
      const id = languageId as Language;
      if (!provider.languages.includes(id)) return undefined;
      return methodCallQuery(id, provider.methods);
    },
  };
}

/**
 * Togglz names its flags as enum constants, not string literals, so it needs its
 * own query shape rather than a method-name list.
 */
const togglzAdapter: ProviderAdapter = {
  id: 'togglz',
  keysAreIdentifiers: true,
  queryFor(_language, languageId) {
    return togglzQuery(languageId as Language);
  },
};

const springAdapter: ProviderAdapter = {
  id: 'spring-conditional',
  queryFor(_language, languageId) {
    return springConditionalQuery(languageId as Language);
  },
};

/**
 * A user-defined helper, so a homegrown `Features.isEnabled(...)` — or a plain
 * `isEnabled(...)` imported from the team's own module — works without a change
 * to this codebase. Configured through `.flagmarshal.yml`.
 */
export function customAdapter(methods: readonly string[]): ProviderAdapter | undefined {
  if (methods.length === 0) return undefined;
  return {
    id: 'custom',
    queryFor(_language, languageId) {
      const member = methodCallQuery(languageId as Language, methods);
      const bare = bareCallQuery(languageId as Language, methods);
      if (member === undefined || bare === undefined) return member ?? bare;
      return `${member}\n${bare}`;
    },
  };
}

/** Every built-in adapter, in a stable order. */
export const BUILT_IN_ADAPTERS: readonly ProviderAdapter[] = [
  ...METHOD_PROVIDERS.map(methodAdapter),
  springAdapter,
  togglzAdapter,
];
