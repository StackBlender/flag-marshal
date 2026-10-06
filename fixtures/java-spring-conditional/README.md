# Fixture: java-spring-conditional

Java with Spring `@ConditionalOnProperty` plus a properties configuration source.

| Flag | Code | Configuration |
| --- | --- | --- |
| `features.nightly-reports` | `ReportingConfig.java` | `application.properties` |
| `features.legacy-export` | `ReportingConfig.java` | `application.properties` |
| `features.retired-dashboard` | none | `application.properties` |

`features.retired-dashboard` is configured but never read, and raises
`flag.absent-from-code` at `medium` confidence. It is the reason this fixture
exists: configuration-only flags are invisible to a code-only scanner.

The other two properties are referenced from `ReportingConfig.java`, so they
correctly raise nothing. Before Java was parsed they produced two false findings —
capped at `low` confidence with `.java` named in the evidence, which is what kept
the claim honest until the grammar landed.
