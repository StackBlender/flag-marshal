# Detector credibility, round 3: a public corpus and constant keys (2026-09-10)

Four public repositories using remote providers were cloned outside any StackBlender repository and scanned.

- **Import gating did not lose remote-provider calls**: OpenFeature and LaunchDarkly call sites were detected with correct attribution in all three repositories containing them.
- **The unsupported-provider disclosure fired on real code**, naming ConfigCat, Flagsmith, Flipt, Optimizely, Statsig and GrowthBook.
- **Flag keys held in constants were reported as computed**: `private static final String FLAG = "string-flag";` then `client.getBooleanValue(FLAG, false)`, the most common real shape. Same-file string constants are now read, and `CONSTANT + "suffix"` chains folded when every part is known.

| Repository | Before | After |
| --- | --- | --- |
| `java-sdk-contrib` | 7 flags, 170 unresolved | **36 flags, 2 unresolved** |
| `js-sdk-contrib` | 25 flags, 133 unresolved | **38 flags, 80 unresolved** |
| `java-server-sdk` | 9 flags, 40 unresolved | 9 flags, 33 unresolved |

What stays unresolved is genuinely unresolvable: `flagKey` and `key` parameters in generic test helpers, and constants exported from another file. A name declared twice with conflicting values is dropped rather than picked. The `computed-keys` fixture still resolves only its one genuine literal.
