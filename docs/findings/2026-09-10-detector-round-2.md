# Detector credibility, round 2: honesty about scope (2026-09-10)

A second review of the same two Spring repositories found six issues; both High ones were failures of honesty about scope.

- **Togglz was unsupported, and the report did not say so.** AcmeCo declares nine Togglz flags; Flag Marshal reported one flag for the repository. Togglz became a provider (enum declarations supply inventory, `Flags.X.isActive()` references, `togglz.features.<KEY>.enabled` normalizes to `<KEY>`), and `ScanReport.unsupportedProviders` now names platforms imported but not analysed (Split, ConfigCat, Flagsmith, GrowthBook, Statsig, PostHog, Optimizely, Flipt, FF4j, FeatureHub) in every format.
- **Spring operational switches were sold as debt.** `@ConditionalOnProperty` proves something is conditional (a queue listener, a scheduled job), not temporary. Four `flag.stale` findings on AcmeNav were correct and useless. Age-based rules now apply only to LaunchDarkly, OpenFeature, Unleash and Togglz.
- **Import gating did not establish call-level identity.** A file importing Unleash turned every `.isEnabled(...)` into a reference, Lombok builders included. The receiver must now be an identifier the file binds to that provider; a receiver containing a call (`Builder.builder()`) or no receiver is rejected.
- `matchIfMissing = true` is honoured as `defaultsWhenAbsent`.
- Verified: the Unleash/Lombok collision yields exactly one flag; a four-year-old Spring conditional produces no stale finding; a Split import produces a disclosure line.
