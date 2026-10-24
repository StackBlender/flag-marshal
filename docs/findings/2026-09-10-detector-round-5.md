# Detector credibility, round 5: parse, do not match text (2026-09-10)

Four findings, two High, both in the round 4 Togglz discovery and both from one mistake: source text matched with a regular expression where it should have been parsed.

- **Any enum implementing an unrelated `Feature` became Togglz flags (High).** `enum ShippingOptions implements Feature` was two feature flags. Discovery now requires `import org.togglz.core.Feature`, a `org.togglz.core.*` wildcard, or the fully qualified name; a qualified `com.other.Feature` never matches.
- **Enum constants with constructor arguments were invisible (High).** Splitting the body on commas made `A("x", true), B("y", false)` produce nothing, and because discovery gates all Togglz detection, it erased the repository's whole inventory. Discovery is now a tree-sitter query.
- **`ReferenceKind` widened at 1.0 (Medium).** The schema now states its pre-release policy: 1.0 is mutable until first release; a field added within a version is optional; after publication a breaking change bumps the major.
- **`module-spread` was useless on Maven/Gradle layouts (Low):** every file starts `src/main/java`. Build scaffolding is stripped and the package is the module.
- A probe passed for the wrong reason (a second guard rejected the file first), the fourth such probe in the project.
- **Corpus coverage is not shape coverage:** the two Togglz corpus repositories contain neither shape that broke. Both now live in `fixtures/java-togglz/`, whose golden had been compared against nothing; it is now asserted through the built CLI.
