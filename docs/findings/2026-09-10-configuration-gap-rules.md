# Configuration sources and gap rules (2026-09-10)

Readers for `application*.properties`, `application*.y[a]ml` and `.env*`; rules for code-but-not-configured, configured-but-unread, and test-only flags. `no-flags` yields 0 flags, 0 findings, 0 unresolved. Probes: treating LaunchDarkly as locally configured fails 2 tests, accepting any configuration namespace fails 2, removing the env-prefix check fails 1.

**The namespace check needs boolean non-flag settings in the fixtures**, or the boolean check alone carries the tests: real Spring settings that *are* boolean (`spring.jpa.show-sql=true`, `server.compression.enabled=true`) and would have been misreported as feature flags. A probe that passes proves nothing.

- **Remotely served providers never raise `flag.missing-in-configuration`.** A LaunchDarkly flag lives in LaunchDarkly and will never appear in `application.properties`; firing the rule would produce a finding for every flag. `provider-traits.ts` draws the line.
- **A configuration entry is a flag only when two signals agree**: a flag-ish namespace (`feature`, `flags`, `toggles`, ...) *and* a boolean-like value.
- **Unparsed languages cap confidence.** If the walk passes over sources no grammar reads, "nothing references this flag" may only mean "nothing this tool can read references it"; `flag.absent-from-code` drops to `low` and names the unread extensions. An unresolved key anywhere caps it too.
- **`flag.unresolved-key` is `high` confidence**: stating what could not be determined is always true.
- **YAML keys are flattened to the dotted form**, so `features: {nightly: true}` and `features.nightly=true` are one flag.
