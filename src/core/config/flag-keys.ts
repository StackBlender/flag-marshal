/**
 * Deciding which configuration entries are feature flags.
 *
 * Not every property is a flag: `spring.application.name=reporting` is
 * configuration, `features.nightly-reports=true` is a flag. Two signals have to
 * agree before an entry is treated as a flag:
 *
 *   1. the key sits under a recognized flag-ish namespace, and
 *   2. the value is boolean-like.
 *
 * This is a heuristic, and it is deliberately narrow. A missed flag shows up as
 * an absent inventory entry a user can notice; a false one puts configuration
 * that has nothing to do with flags in front of them and costs trust. Teams with
 * their own conventions get explicit custom patterns in Milestone 6 rather than
 * a looser default here.
 */
const NAMESPACES = ['feature', 'features', 'flag', 'flags', 'toggle', 'toggles'];

const BOOLEAN_VALUES = new Set(['true', 'false', 'on', 'off', 'yes', 'no', 'enabled', 'disabled']);

/** Environment-variable prefixes that conventionally mark a switch. */
const ENV_PREFIXES = ['FEATURE_', 'FEATURES_', 'FLAG_', 'FLAGS_', 'TOGGLE_', 'ENABLE_'];

export function isBooleanLike(value: string): boolean {
  return BOOLEAN_VALUES.has(value.trim().toLowerCase());
}

/** True when a dotted configuration key sits under a flag namespace. */
export function isFlagNamespace(key: string): boolean {
  const first = key.split('.')[0]?.toLowerCase();
  return first !== undefined && NAMESPACES.includes(first);
}

/** True when an environment variable name looks like a feature switch. */
export function isFlagEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  return ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}
