# Fixture: real-world-shapes

Derived from patterns found while testing against two real Spring repositories.
Every case here was wrong before the detector-credibility slice.

| Case | Was | Is |
| --- | --- | --- |
| `@ConditionalOnProperty(name = ["acmeco.allow-override-user-expiration"])` | whole array reported as a computed key | resolves to the literal key |
| `@ConditionalOnProperty(name = ["scheduledJobs.aiAppointment.enabled"])` | same | resolves |
| `acmeco.allow-override-user-expiration: true` in YAML | "referenced in code but absent from configuration" | correlated with the annotation |
| `AppSettingsAuditEvent.builder().isEnabled(x)` | reported as an Unleash flag | not a flag — no Unleash import |
| `getStringValue(intake, "...")` | reported as an OpenFeature flag | not a flag — no OpenFeature import |
| `plan.variation("standard")` | reported as a LaunchDarkly flag | not a flag — no LaunchDarkly import |
| `client.boolVariation("checkout-v2", ...)` with the LD import | detected | still detected |

`spring.jpa.show-sql` and `server.compression.enabled` are boolean settings under
non-flag namespaces that nothing reads as a flag. They must never appear.

Expected: **3 flags** — `acmeco.allow-override-user-expiration`,
`checkout-v2`, and `scheduledJobs.aiAppointment.enabled` — and zero unresolved
references.

The product principle at stake: missing an unsupported pattern is acceptable when
clearly represented; confidently labelling ordinary application code as
feature-flag debt is not.
