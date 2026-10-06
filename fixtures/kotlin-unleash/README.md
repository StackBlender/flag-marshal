# Fixture: kotlin-unleash

Kotlin with the Unleash SDK.

| Flag | References |
| --- | --- |
| `search-ranking-v3` | `src/Search.kt` |
| `typeahead` | `src/Search.kt` |

Both are evaluated through `Unleash.isEnabled`. This fixture proves Kotlin
detection works without a Spring dependency and that a second provider needs no
change to the index, evidence, or scoring layers.
