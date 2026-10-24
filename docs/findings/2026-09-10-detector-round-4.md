# Detector credibility, round 4: Togglz usages and declarations (2026-09-10)

Six findings, three High.

- **Togglz usages were almost entirely missed (High).** Usage files import the *application's* enum (`com.example.FeatureFlags`), not `org.togglz`, so the file-level import gate that made round 2 correct made Togglz wrong. The session now takes a first pass over JVM sources to find enums implementing `Feature`, and usages are matched as plain member access filtered against those enums, which also catches wrappers like `getTogglzFlagDetails(FeatureFlags.X)`.
- **Enum declarations counted as code usage (High)**, hiding flags nothing calls. `declaration` is now a distinct `ReferenceKind`; `flag.absent-from-code` and `flag.test-only` count usages only.
- **A test-local feature enum polluted the inventory (Medium):** a `TestFlags` enum produced a phantom `FEATURE_A` with two findings. Enums under test sources no longer establish inventory; test usages of production flags still count.
- **The contract changed incompatibly (Medium):** `unsupportedProviders` was made required while `schemaVersion` stayed `1.0`. It is now optional, additive within the version.
- **Togglz configuration ranges underlined `enabled` (Low)** rather than the key above it.
- **The Kotlin Togglz query was too broad (Low)**: it captured every enum entry once Togglz was in scope.
- Found while fixing: two query patterns could match the same node, double-counting a reference and inflating counts, spread, confidence and score. References are deduplicated by key, position, provider and kind.
