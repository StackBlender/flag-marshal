# The corpus regression suite (2026-09-10)

Four review rounds produced seventeen defects the fixtures did not catch. Twelve public repositories now stand in for that missing perspective, two per supported provider, plus two that must find nothing.

| Provider | Repositories |
| --- | --- |
| LaunchDarkly | `java-server-sdk`, `node-server-sdk` |
| OpenFeature | `java-sdk-contrib`, `js-sdk-contrib` |
| Unleash | `unleash-java-sdk`, `unleash-node-sdk`, `unleash-client-java-examples` |
| Togglz | `togglz`, `togglz-samples` |
| Spring `@ConditionalOnProperty` | `spring-boot`, `togglz` |
| properties / YAML | `togglz`, `togglz-samples` |

`spring-petclinic` and the Unleash **server** must stay at zero; a change that reports flags there is a false-positive regression.

**Expanding the corpus immediately found a defect.** Both Unleash repositories reported zero flags: `const client = new Unleash(...)` was not recognized as binding a receiver. With constructor bindings, `unleash-node-sdk` went from **0 to 20 flags** and `unleash-java-sdk` from 0 to 14.

`scripts/scan-corpus.mjs` records flag counts, unresolved counts and providers per repository in the committed `corpus-baseline.json`, and fails when counts fall, a provider stops being detected, or unresolved references rise. The corpus is not checked in; `npm test` runs the check only when it is present. These are mostly SDK repositories whose keys are test fixtures: they measure recall and noise, not how much debt a real product carries.
