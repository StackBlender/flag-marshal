# Detector credibility, round 6: constants from the parse tree (2026-09-10)

Four findings, two High, both in the round 3 constant resolution, with the same cause as round 5. Three features (provider identity, Togglz discovery, constant resolution) used regex where parsing was needed. The rule: if the question is "what does this code declare", parse it.

- **Mutable bindings resolved as constants (High):** `let FLAG = 'first'; FLAG = 'second';` reported `first`. Java `String` fields without `final` had the same problem.
- **A comment could invent a flag key (High):** `// const FLAG = 'invented-key'` fabricated that key. Declarations are now read from the parse tree already built for the scan.
- **Effectively final, so correctness cost no recall.** Requiring `final`/`const` dropped two real detections in `unleash-java-sdk`; a same-file assignment query now treats a binding nothing writes to as immutable, and corpus recall returned to 14.
- **Any Togglz import qualified a foreign `Feature` (Medium):** only `org.togglz.core.Feature` or `org.togglz.core.*` qualify now. The JVM import pattern's greedy class also swallowed the dot before `*`, so wildcard imports never matched.
- **Togglz enums keyed by simple class name (Low):** fixed in [Togglz hardening](2026-09-10-togglz-hardening.md).
- Probes: removing assignment analysis fails 2 tests, widening the Togglz import check fails 1.
