# Fixture: ts-launchdarkly

TypeScript with the LaunchDarkly Node server SDK.

| Flag | References | Notes |
| --- | --- | --- |
| `checkout-v2` | `src/checkout.ts`, `src/pricing.ts` | Referenced from two files; the inventory must merge them into one record |
| `express-shipping` | `src/checkout.ts` | Single production reference |

`src/checkout.test.ts` contains no SDK call. It exists so that test files are
present in the walk without contributing flag references, which is a different
case from the test-only flag covered by `mixed-polyglot`.

No configuration source defines these flags, and **that is expected to produce no
findings at all.** LaunchDarkly serves flags from its own backend, so a local
configuration entry would be the surprise, not its absence.
`flag.missing-in-configuration` fires only for mechanisms that are supposed to be
configured locally — Spring `@ConditionalOnProperty`, properties files, and
environment switches. See `src/core/detect/provider-traits.ts`.

(An earlier draft of this file predicted the opposite. Firing that rule for every
remote flag would produce a finding for every flag in a repository, which is the
fastest way to get an analyzer uninstalled.)
