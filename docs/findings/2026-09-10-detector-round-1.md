# Detector credibility, round 1: provider identity (2026-09-10)

Another agent ran Flag Marshal against two real Spring repositories, `acmenav-service` (Kotlin) and `acmeco-webapp` (Java), and found four defects fixtures could never have caught, because every fixture was written by the same person who wrote the detector.

**Superseded decision:** milestones 2 and 6 matched provider queries on SDK method name alone ("a visible false match beats an invisible miss"). Real repositories showed that was wrong: `isEnabled` is a Lombok builder setter, `getStringValue` a helper on an intake form, `variation` a domain method on a pricing plan. A provider's methods are now searched for only in files that import that provider, read from `import`/`require` statements, not the whole text. `spring-conditional` and `custom` stay ungated.

- Kotlin and Java `@ConditionalOnProperty` array literals resolve to one reference per literal instead of one computed key.
- Configuration correlation accepts any namespace when code demonstrably reads the key.
- Unresolved wording no longer overstates certainty, and names the provider.
- Nested YAML keys had their range length computed from the dotted key rather than the leaf text, underlining past the end of the line.
- **Known, deliberate miss:** a file that receives an already-constructed client without importing its type is not detected.
- `fixtures/real-world-shapes/` reproduces every reported shape: exactly three flags, zero unresolved, nothing from `OrdinaryCode.java`. Probes: removing the identity gate fails 4 tests, removing array expansion fails 4.
