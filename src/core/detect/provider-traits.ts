import type { Provider } from '../api/generated/scan-report.js';

/**
 * Whether a provider's flags are expected to appear in local configuration.
 *
 * This distinction prevents the product's most obvious false positive. A
 * LaunchDarkly flag is served from LaunchDarkly's own backend and will never
 * appear in `application.properties`, so reporting "referenced in code but
 * absent from configuration" for every remote flag would fire on every flag in
 * the repository — noise that gets an analyzer uninstalled on first run.
 *
 * Locally-configured mechanisms are the opposite: a Spring
 * `@ConditionalOnProperty` with no matching property really is dead, because
 * there is no remote source that could supply it.
 */
const REMOTELY_SERVED: ReadonlySet<Provider> = new Set<Provider>([
  'launchdarkly',
  'openfeature',
  'unleash',
]);

/**
 * True when a missing local configuration entry is meaningful for this provider.
 *
 * Changing this set changes what `flag.missing-in-configuration` can mean, so the
 * explanation in `catalog/messages.json` has to change with it. It did not once:
 * the wording offered "the flag is served entirely by a remote provider" as a
 * possible cause of a rule that, by this gate, can never fire for one. A user who
 * checks an explanation against the evidence and finds it impossible stops
 * trusting every other explanation too.
 */
export function expectsLocalConfiguration(provider: Provider): boolean {
  return !REMOTELY_SERVED.has(provider);
}

/**
 * Whether a provider's presence suggests a *temporary* feature flag.
 *
 * This is the distinction between a feature flag and an operational switch, and
 * getting it wrong makes the tool useless on a real Spring codebase.
 * `@ConditionalOnProperty` proves something is conditional — a queue listener, a
 * scheduled job, non-production basic auth — not that it is a temporary rollout
 * waiting to be cleaned up. Those switches are permanent by design, and telling a
 * team their queue listener is "stale" after a year is noise they cannot act on.
 *
 * Dedicated flag platforms are the opposite: you reach for LaunchDarkly, Unleash,
 * OpenFeature or Togglz because you intend to remove the branch later. Age is
 * meaningful evidence there.
 *
 * Age-based rules are therefore restricted to providers that imply temporary
 * intent. Rules grounded in something other than age — configured but never read,
 * referenced only from tests — still apply everywhere.
 */
const TEMPORARY_BY_INTENT: ReadonlySet<Provider> = new Set<Provider>([
  'launchdarkly',
  'openfeature',
  'unleash',
  'togglz',
]);

/** True when this provider's flags are usually meant to be removed eventually. */
export function impliesTemporaryFeature(provider: Provider): boolean {
  return TEMPORARY_BY_INTENT.has(provider);
}
